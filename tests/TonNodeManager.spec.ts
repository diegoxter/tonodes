import { Blockchain, type SandboxContract, type TreasuryContract } from "@ton/sandbox";
import { toNano } from "@ton/core";
import { TonNodeManager } from "../wrappers/TonNodeManager";
import { TonNode } from "../wrappers/TonNode";
import "@ton/test-utils";

const cleanObject = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

describe("TonNodeManager", () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let tonNodeManager: SandboxContract<TonNodeManager>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury("deployer");

        tonNodeManager = blockchain.openContract(
            await TonNodeManager.fromInit(deployer.address),
        );

        const deployResult = await tonNodeManager.send(
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
            to: tonNodeManager.address,
            deploy: true,
            success: true,
        });

        blockchain.now = deployResult.transactions[1].now;
    });

    it("should deploy", async () => {
        const instanceOwner = await tonNodeManager.getOwner();
        expect(instanceOwner.equals(deployer.address)).toBeTruthy();
    });

    it("should respect ownership", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");
        const failedChangeDCost1 = await tonNodeManager.send(
            notDeployer.getSender(),
            { value: toNano("123") },
            {
                $$type: "ChangeDeployCost",
                newCost: toNano("1"),
            },
        );

        expect(failedChangeDCost1.transactions).toHaveTransaction({
            to: tonNodeManager.address,
            exitCode: 44764,
        });

        const previousDeployCost = await tonNodeManager.getDeployCost();
        expect(previousDeployCost.toString()).toEqual(toNano("1").toString());

        blockchain.now += 5;

        const failedChangeDCost2 = await tonNodeManager.send(
            deployer.getSender(),
            { value: toNano("123") },
            {
                $$type: "ChangeDeployCost",
                newCost: toNano("0.001"),
            },
        );

        expect(failedChangeDCost2.transactions).toHaveTransaction({
            to: tonNodeManager.address,
            exitCode: 57662,
        });

        const failedChangeDCost3 = await tonNodeManager.send(
            notDeployer.getSender(),
            { value: toNano("0.1") },
            {
                $$type: "Withdraw",
            },
        );

        expect(failedChangeDCost3.transactions).toHaveTransaction({
            from: notDeployer.address,
            to: tonNodeManager.address,
            exitCode: 6391,
        });
    });

    it("should change it's internal variables", async () => {
        const changeDCost = await tonNodeManager.send(
            deployer.getSender(),
            { value: toNano("123") },
            {
                $$type: "ChangeDeployCost",
                newCost: toNano("2"),
            },
        );

        expect(changeDCost.transactions).toHaveTransaction({
            from: deployer.address,
            to: tonNodeManager.address,
            success: true,
        });

        const newDeployCost = await tonNodeManager.getDeployCost();
        expect(newDeployCost.toString()).toEqual(toNano("2").toString());
    });

    it("should deploy new nodes", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");

        const newNodeUID = "test-id";

        await tonNodeManager.send(
            notDeployer.getSender(),
            { value: toNano("1.1") },
            {
                $$type: "DeployNode",
                newUID: newNodeUID,
                body: {
                    $$type: "Params",
                    nodeUID: newNodeUID,
                    nodeOwner: notDeployer.address,
                },
            },
        );

        const deployedInstancesIndex = await tonNodeManager.getInstancesIndex();
        expect(deployedInstancesIndex).toEqual(1n);
        const deployedInstance =
            await tonNodeManager.getInstanceInfoPerIndex(deployedInstancesIndex);

        const notDeployerNodeInstance = (
            await tonNodeManager.getInstancesPerUser(notDeployer.address)
        ).get(deployedInstancesIndex);

        expect(cleanObject(notDeployerNodeInstance)).toEqual(cleanObject(deployedInstance));
        const nodeInstance = TonNode.fromAddress(deployedInstance.Address);

        expect(nodeInstance?.address.equals(deployedInstance.Address));
    });

    it("should manage several nodes", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");
        const notDeployer2 = await blockchain.treasury("notDeployer2");
        const notDeployer3 = await blockchain.treasury("notDeployer3");
        const notDeployer4 = await blockchain.treasury("notDeployer4");
        const notDeployer5 = await blockchain.treasury("notDeployer5");

        const newNodeUID = "test-id-";
        let nodeIndex = 1;
        const usersArray = [
            deployer,
            notDeployer,
            notDeployer2,
            notDeployer3,
            notDeployer4,
            notDeployer5,
        ];

        for (const user of usersArray) {
            await tonNodeManager.send(
                user.getSender(),
                { value: toNano("1.1") },
                {
                    $$type: "DeployNode",
                    newUID: newNodeUID + nodeIndex,
                    body: {
                        $$type: "Params",
                        nodeUID: newNodeUID,
                        nodeOwner: user.address,
                    },
                },
            );

            nodeIndex += 1;
            blockchain.now += 10;
        }

        const deployedInstancesIndex = await tonNodeManager.getInstancesIndex();
        expect(deployedInstancesIndex.toString()).toEqual("6");
        const deployedInstances = [];

        for (let index = 0; index < Number(deployedInstancesIndex); index++) {
            deployedInstances[index] = await tonNodeManager.getInstanceInfoPerIndex(
                BigInt(index + 1),
            );
        }

        for (let index = 0; index < deployedInstances.length; index++) {
            expect(cleanObject(deployedInstances[index])).toEqual(
                cleanObject({
                    $$type: "NodeInstance",
                    UID: "test-id-" + (index + 1),
                    Address: deployedInstances[index].Address,
                    Owner: usersArray[index].address,
                }),
            );
        }
    });

    it("should receive TON and allow the owner to withdraw it", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");
        const notDeployer2 = await blockchain.treasury("notDeployer2");
        const notDeployer3 = await blockchain.treasury("notDeployer3");
        const notDeployer4 = await blockchain.treasury("notDeployer4");
        const notDeployer5 = await blockchain.treasury("notDeployer5");

        const initialValue = await tonNodeManager.getBalance();
        expect(initialValue == 0n).toBeTruthy();

        const newNodeUID = "test-id-";
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
            await tonNodeManager.send(
                user.getSender(),
                { value: toNano("1.1") },
                {
                    $$type: "DeployNode",
                    newUID: newNodeUID + nodeIndex,
                    body: {
                        $$type: "Params",
                        nodeUID: newNodeUID,
                        nodeOwner: user.address,
                    },
                },
            );

            nodeIndex += 1;
            blockchain.now += 10;
            const currentValue = await tonNodeManager.getBalance();

            expect(currentValue).toBeGreaterThanOrEqual(
                toNano(valueTracker) - toNano(tolerance),
            );

            valueTracker += 1n;
        }

        const withdrawTx = await tonNodeManager.send(
            deployer.getSender(),
            { value: toNano("0.1") },
            {
                $$type: "Withdraw",
            },
        );

        expect(withdrawTx.transactions).toHaveTransaction({
            from: deployer.address,
            to: tonNodeManager.address,
            success: true,
        });

        const currentValue = await tonNodeManager.getBalance();
        expect(currentValue).toBeLessThanOrEqual(toNano("0.02"));
    });

    it("should not deploy if the value sent is not enough", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");

        const newNodeUID = "test-id";
        const failedTx = await tonNodeManager.send(
            notDeployer.getSender(),
            { value: toNano("0.01") },
            {
                $$type: "DeployNode",
                newUID: newNodeUID,
                body: {
                    $$type: "Params",
                    nodeUID: newNodeUID,
                    nodeOwner: notDeployer.address,
                },
            },
        );

        expect(failedTx.transactions).toHaveTransaction({
            to: tonNodeManager.address,
            exitCode: 63335,
        });
    });

    it("should not deploy nodes if the correct value is not sent", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");

        const newNodeUID = "test-id";
        const failedTx = await tonNodeManager.send(
            notDeployer.getSender(),
            { value: toNano("0.1") },
            {
                $$type: "DeployNode",
                newUID: newNodeUID,
                body: {
                    $$type: "Params",
                    nodeUID: newNodeUID,
                    nodeOwner: notDeployer.address,
                },
            },
        );

        expect(failedTx.transactions).toHaveTransaction({
            to: tonNodeManager.address,
            aborted: true,
            exitCode: 63335,
        });
    });

    it("should let users refill their nodes", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");

        const newNodeUID = "test-id";
        await tonNodeManager.send(
            notDeployer.getSender(),
            { value: toNano("1.1") },
            {
                $$type: "DeployNode",
                newUID: newNodeUID,
                body: {
                    $$type: "Params",
                    nodeUID: newNodeUID,
                    nodeOwner: notDeployer.address,
                },
            },
        );

        const userInstances = await tonNodeManager.getInstancesPerUser(notDeployer.address);
        const nodeInstance = blockchain.openContract(
            TonNode.fromAddress(userInstances.get(1n).Address),
        );

        // time moves on
        blockchain.now += 60 * 60 * 12;

        const refillTx = await tonNodeManager.send(
            notDeployer.getSender(),
            { value: toNano("1.123") },
            {
                $$type: "RefillNode",
                nodeInstance: 1n,
            },
        );

        expect(refillTx.transactions).toHaveTransaction({
            to: nodeInstance.address,
            success: true,
        });
    });

    it("should change node values as expected", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");

        const newNodeUID = "test-id";
        const tx1 = await tonNodeManager.send(
            notDeployer.getSender(),
            { value: toNano("1.1") },
            {
                $$type: "DeployNode",
                newUID: newNodeUID,
                body: {
                    $$type: "Params",
                    nodeUID: newNodeUID,
                    nodeOwner: notDeployer.address,
                },
            },
        );
        const oldNow = tx1.transactions[1].now;

        const userInstances = await tonNodeManager.getInstancesPerUser(notDeployer.address);
        const nodeInstance = blockchain.openContract(
            TonNode.fromAddress(userInstances.get(1n).Address),
        );
        const initialValues = await nodeInstance.getInstanceInfo();

        // time moves on
        blockchain.now += 60 * 60 * 12;
        const tx2 = await tonNodeManager.send(
            notDeployer.getSender(),
            { value: toNano("1.123") },
            {
                $$type: "RefillNode",
                nodeInstance: 1n,
            },
        );
        const currentNow = tx2.transactions[1].now;
        const newValues = await nodeInstance.getInstanceInfo();

        expect(newValues.nodeEndTime).toEqual(
            initialValues.nodeStartTime + BigInt(60 * 60 * 12) - BigInt(oldNow) + 86400n,
        );
        expect(newValues.nodeStartTime).toEqual(BigInt(currentNow));
    });

    it("should respect node manager ownership and refill time limits", async () => {
        const nodeOwner = await blockchain.treasury("nodeOwner");
        const notNodeOwner = await blockchain.treasury("notNodeOwner");
        const newNodeUID = "test-id";

        await tonNodeManager.send(
            nodeOwner.getSender(),
            { value: toNano("1.1") },
            {
                $$type: "DeployNode",
                newUID: newNodeUID,
                body: {
                    $$type: "Params",
                    nodeUID: newNodeUID,
                    nodeOwner: nodeOwner.address,
                },
            },
        );

        const userInstances = await tonNodeManager.getInstancesPerUser(nodeOwner.address);
        const nodeInstance = blockchain.openContract(
            TonNode.fromAddress(userInstances.get(1n).Address),
        );

        // not enough time has passed
        const failedTx1 = await tonNodeManager.send(
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
            {
                $$type: "Refill",
                amountOfDays: 1n,
            },
        );

        expect(failedTx2.transactions).toHaveTransaction({
            to: nodeInstance.address,
            exitCode: 15886,
        });

        // time moves on
        blockchain.now += 60 * 60 * 12;

        // not authorized, not the node's owner
        const failedTx3 = await tonNodeManager.send(
            notNodeOwner.getSender(),
            { value: toNano("1.123") },
            {
                $$type: "RefillNode",
                nodeInstance: 1n,
            },
        );

        expect(failedTx3.transactions).toHaveTransaction({
            to: tonNodeManager.address,
            exitCode: 21493,
        });

        const success = await tonNodeManager.send(
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
