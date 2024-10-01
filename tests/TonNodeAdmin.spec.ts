import { Blockchain, type SandboxContract, type TreasuryContract } from "@ton/sandbox";
import { toNano } from "@ton/core";
import { TonNodeAdmin } from "../wrappers/TonNodeAdmin";
import { TonNode } from "../wrappers/TonNode";
import { TonNodeFarm } from "../wrappers/TonNodeFarm";
import { NodeCoin } from "../wrappers/NodeCoin";
import { OwnedNodesArray } from "../wrappers/OwnedNodesArray";
import "@ton/test-utils";
import { buildOnchainMetadata } from "../scripts/jetton-helpers";

const cleanObject = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));
const jettonParams = {
    name: "NodeCoin",
    description: "The coin of your favorite Node provider",
    symbol: "NCOI",
    image: "https://play-lh.googleusercontent.com/ahJtMe0vfOlAu1XJVQ6rcaGrQBgtrEZQefHy7SXB7jpijKhu1Kkox90XDuH8RmcBOXNn",
};
let content = buildOnchainMetadata(jettonParams);
let max_supply = toNano(1234766689011);

describe("TonNodeAdmin", () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let tonNodeAdmin: SandboxContract<TonNodeAdmin>;
    let token: SandboxContract<NodeCoin>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury("deployer");
        // deploy token
        token = blockchain.openContract(
            await NodeCoin.fromInit(deployer.address, content, max_supply),
        );
        await token.send(
            deployer.getSender(),
            { value: toNano("0.05") },
            {
                $$type: "Deploy",
                queryId: 0n,
            },
        );

        tonNodeAdmin = blockchain.openContract(
            await TonNodeAdmin.fromInit(deployer.address, token.address),
        );

        const deployResult = await tonNodeAdmin.send(
            deployer.getSender(),
            {
                value: toNano("0.05"),
            },
            {
                $$type: "Deploy",
                queryId: 0n,
            },
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: tonNodeAdmin.address,
            deploy: true,
            success: true,
        });

        blockchain.now = deployResult.transactions[1].now;
    });

    it("should deploy", async () => {
        const instanceOwner = await tonNodeAdmin.getOwner();
        expect(instanceOwner.equals(deployer.address)).toBeTruthy();
    });

    it("should respect ownership", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");
        const failedChangeDCost1 = await tonNodeAdmin.send(
            notDeployer.getSender(),
            { value: toNano("123") },
            {
                $$type: "ChangeDeployCost",
                newCost: toNano("1"),
            },
        );

        expect(failedChangeDCost1.transactions).toHaveTransaction({
            to: tonNodeAdmin.address,
            exitCode: 132,
        });

        const previousDeployCost = await tonNodeAdmin.getDeployCost();
        expect(previousDeployCost.toString()).toEqual(toNano("1").toString());

        blockchain.now += 5;

        const failedChangeDCost2 = await tonNodeAdmin.send(
            deployer.getSender(),
            { value: toNano("123") },
            {
                $$type: "ChangeDeployCost",
                newCost: toNano("0.001"),
            },
        );

        expect(failedChangeDCost2.transactions).toHaveTransaction({
            to: tonNodeAdmin.address,
            exitCode: 57662,
        });

        const failedChangeDCost3 = await tonNodeAdmin.send(
            notDeployer.getSender(),
            { value: toNano("0.1") },
            "Withdraw",
        );

        expect(failedChangeDCost3.transactions).toHaveTransaction({
            from: notDeployer.address,
            to: tonNodeAdmin.address,
            exitCode: 132,
        });
    });

    it("should change it's internal variables", async () => {
        const changeDCost = await tonNodeAdmin.send(
            deployer.getSender(),
            { value: toNano("123") },
            {
                $$type: "ChangeDeployCost",
                newCost: toNano("2"),
            },
        );

        expect(changeDCost.transactions).toHaveTransaction({
            from: deployer.address,
            to: tonNodeAdmin.address,
            success: true,
        });

        const newDeployCost = await tonNodeAdmin.getDeployCost();
        expect(newDeployCost.toString()).toEqual(toNano("2").toString());
    });

    it("should deploy new nodes", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");

        const tx = await tonNodeAdmin.send(
            notDeployer.getSender(),
            { value: toNano("1.5") },
            "DeployNode",
        );

        const notDeployerNodeFarm = blockchain.openContract(
            await TonNodeFarm.fromInit(
                tonNodeAdmin.address,
                token.address,
                notDeployer.address,
            ),
        );

        const deployedInstancesIndex = await tonNodeAdmin.getNodesIndex();
        expect(deployedInstancesIndex).toEqual(1n);
        const deployedInstanceAddy =
            await tonNodeAdmin.getInstanceInfoPerIndex(deployedInstancesIndex);

        const deployedInstance = blockchain.openContract(
            TonNode.fromAddress(deployedInstanceAddy),
        );
        const ownedNodesArray = blockchain.openContract(
            await OwnedNodesArray.fromInit(notDeployerNodeFarm.address),
        );

        expect(tx.transactions).toHaveTransaction({
            from: tonNodeAdmin.address,
            to: notDeployerNodeFarm.address,
            success: true,
            op: 0xbdb37b6d,
            deploy: true,
        });
        expect(tx.transactions).toHaveTransaction({
            from: notDeployerNodeFarm.address,
            to: deployedInstance.address,
            success: true,
            deploy: true,
        });
        expect(tx.transactions).toHaveTransaction({
            from: notDeployerNodeFarm.address,
            to: ownedNodesArray.address,
            success: true,
            deploy: true,
        });
        expect(tx.transactions).toHaveTransaction({
            from: notDeployerNodeFarm.address,
            to: ownedNodesArray.address,
            success: true,
            op: 0xfd43d25d,
        });

        expect(tx.externals[0].info.src.equals(deployedInstance.address)).toBeTruthy();
        const notDeployerOwnedNodesArray = await ownedNodesArray.getInstancesPerUser();
        expect(notDeployerOwnedNodesArray.m.get(0) == 1n).toBeTruthy();
    });

    it("should manage several nodes", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");
        const notDeployer2 = await blockchain.treasury("notDeployer2");
        const notDeployer3 = await blockchain.treasury("notDeployer3");
        const notDeployer4 = await blockchain.treasury("notDeployer4");
        const notDeployer5 = await blockchain.treasury("notDeployer5");

        const usersArray = [
            deployer,
            notDeployer,
            notDeployer2,
            notDeployer3,
            notDeployer4,
            notDeployer5,
        ];

        for (const user of usersArray) {
            await tonNodeAdmin.send(user.getSender(), { value: toNano("1.5") }, "DeployNode");

            blockchain.now += 10;
        }

        const ownedNodesPerUserArray = [];
        for (let index = 0; index < usersArray.length; index++) {
            const userNodeFarm = blockchain.openContract(
                await TonNodeFarm.fromInit(
                    tonNodeAdmin.address,
                    token.address,
                    usersArray[index].address,
                ),
            );

            const ownedNodesArray = blockchain.openContract(
                await OwnedNodesArray.fromInit(userNodeFarm.address),
            );

            ownedNodesPerUserArray.push(ownedNodesArray);
        }

        let counter = 1;
        for (const instance of ownedNodesPerUserArray) {
            const ownedNodesArray = await instance.getInstancesPerUser();
            expect(ownedNodesArray.m.get(0) == BigInt(counter)).toBeTruthy();

            counter++;
        }

        const deployedInstancesIndex = await tonNodeAdmin.getNodesIndex();
        expect(deployedInstancesIndex == 6n).toBeTruthy();

        await tonNodeAdmin.send(
            notDeployer.getSender(),
            { value: toNano("1.5") },
            "DeployNode",
        );
        const ownedNodes = await ownedNodesPerUserArray[1].getInstancesPerUser();
        expect(ownedNodes.m.get(1) == BigInt(counter)).toBeTruthy();
    });

    it("should receive TON and allow the owner to withdraw it", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");
        const notDeployer2 = await blockchain.treasury("notDeployer2");
        const notDeployer3 = await blockchain.treasury("notDeployer3");
        const notDeployer4 = await blockchain.treasury("notDeployer4");
        const notDeployer5 = await blockchain.treasury("notDeployer5");

        const initialValue = await tonNodeAdmin.getBalance();
        expect(initialValue == 0n).toBeTruthy();

        let nodeIndex = 1;
        const usersArray = [
            deployer,
            notDeployer,
            notDeployer2,
            notDeployer3,
            notDeployer4,
            notDeployer5,
        ];

        let valueTracker = 1n;
        const tolerance = "0.1";
        for (const user of usersArray) {
            await tonNodeAdmin.send(user.getSender(), { value: toNano("1.5") }, "DeployNode");

            nodeIndex += 1;
            blockchain.now += 10;
            const currentValue = await tonNodeAdmin.getBalance();

            expect(currentValue).toBeGreaterThanOrEqual(
                toNano(valueTracker) - toNano(tolerance),
            );

            valueTracker += 1n;
        }

        const withdrawTx = await tonNodeAdmin.send(
            deployer.getSender(),
            { value: toNano("0.1") },
            "Withdraw",
        );

        expect(withdrawTx.transactions).toHaveTransaction({
            from: deployer.address,
            to: tonNodeAdmin.address,
            success: true,
        });

        const currentValue = await tonNodeAdmin.getBalance();
        expect(currentValue).toBeLessThanOrEqual(toNano("0.02"));
    });

    it("should not deploy if the value sent is not enough", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");

        const failedTx = await tonNodeAdmin.send(
            notDeployer.getSender(),
            { value: toNano("0.01") },
            "DeployNode",
        );

        expect(failedTx.transactions).toHaveTransaction({
            to: tonNodeAdmin.address,
            exitCode: 63335,
        });
    });

    it("should let users refill their nodes", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");

        await tonNodeAdmin.send(
            notDeployer.getSender(),
            { value: toNano("1.5") },
            "DeployNode",
        );

        const currentTime1 = blockchain.now;
        const nodeInstance = blockchain.openContract(
            TonNode.fromAddress(await tonNodeAdmin.getInstanceInfoPerIndex(1n)),
        );

        // time moves on
        blockchain.now += 60 * 60 * 12;
        const nodeInfo1 = await nodeInstance.getInstanceInfo();
        expect(nodeInfo1.nodeStartTime == BigInt(currentTime1)).toBeTruthy();

        const refillTx = await tonNodeAdmin.send(
            notDeployer.getSender(),
            { value: toNano("1.123") },
            {
                $$type: "RefillNode",
                nodeInstance: 1n,
            },
        );

        const notDeployerNodeFarm = blockchain.openContract(
            await TonNodeFarm.fromInit(
                tonNodeAdmin.address,
                token.address,
                notDeployer.address,
            ),
        );

        expect(refillTx.transactions).toHaveTransaction({
            from: tonNodeAdmin.address,
            to: notDeployerNodeFarm.address,
            success: true,
        });
        expect(refillTx.transactions).toHaveTransaction({
            from: notDeployerNodeFarm.address,
            to: nodeInstance.address,
            success: true,
        });

        const currentTime2 = blockchain.now;
        const nodeInfo2 = await nodeInstance.getInstanceInfo();
        expect(nodeInfo2.nodeStartTime == BigInt(currentTime2)).toBeTruthy();
        expect(
            nodeInfo2.nodeEndTime == BigInt(60 * 60 * 24 - 60 * 60 * 12 + 60 * 60 * 24),
        ).toBeTruthy();
    });

    it("should respect node manager ownership and refill time limits", async () => {
        const nodeOwner = await blockchain.treasury("nodeOwner");
        const notNodeOwner = await blockchain.treasury("notNodeOwner");

        await tonNodeAdmin.send(nodeOwner.getSender(), { value: toNano("1.5") }, "DeployNode");

        const nodeInstance = blockchain.openContract(
            await TonNode.fromInit(tonNodeAdmin.address, 1n),
        );

        // not enough time has passed
        const failedTx1 = await tonNodeAdmin.send(
            nodeOwner.getSender(),
            { value: toNano("1.123") },
            {
                $$type: "RefillNode",
                nodeInstance: 1n,
            },
        );

        expect(failedTx1.transactions).toHaveTransaction({
            to: nodeInstance.address,
            exitCode: 31740,
        });

        // cant update on its own, only node manager contract can
        const failedTx2 = await nodeInstance.send(
            nodeOwner.getSender(),
            { value: toNano("1.123") },
            "refill",
        );

        expect(failedTx2.transactions).toHaveTransaction({
            to: nodeInstance.address,
            exitCode: 132,
        });

        // time moves on
        blockchain.now += 60 * 60 * 12;

        // not authorized, not the node's owner
        const failedTx3 = await tonNodeAdmin.send(
            notNodeOwner.getSender(),
            { value: toNano("1.123") },
            {
                $$type: "RefillNode",
                nodeInstance: 1n,
            },
        );

        expect(failedTx3.transactions).toHaveTransaction({
            from: tonNodeAdmin.address,
            success: false,
        });

        const success = await tonNodeAdmin.send(
            nodeOwner.getSender(),
            { value: toNano("1.123") },
            {
                $$type: "RefillNode",
                nodeInstance: 1n,
            },
        );

        expect(success.transactions).toHaveTransaction({
            to: nodeInstance.address,
            success: true,
        });
    });
});
