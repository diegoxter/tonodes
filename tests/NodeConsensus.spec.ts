import {
    Blockchain,
    BlockchainTransaction,
    ExternalOut,
    SandboxContract,
    TreasuryContract,
} from "@ton/sandbox";
import { toNano, beginCell } from "@ton/core";
import { NodeConsensus } from "../wrappers/NodeConsensus";
import { TonNodeManager } from "../wrappers/TonNodeManager";
import { NodeCoin } from "../wrappers/NodeCoin";
import { NodeCoinWallet } from "../build/NodeConsensus/tact_NodeCoinWallet";
import "@ton/test-utils";
import { buildOnchainMetadata } from "../scripts/jetton-helpers";

const jettonParams = {
    name: "NodeCoin",
    description: "The coin of your favorite Node provider",
    symbol: "NCOI",
    image: "https://play-lh.googleusercontent.com/ahJtMe0vfOlAu1XJVQ6rcaGrQBgtrEZQefHy7SXB7jpijKhu1Kkox90XDuH8RmcBOXNn",
};
let content = buildOnchainMetadata(jettonParams);
let max_supply = toNano(1234766689011);

describe("NodeConsensus", () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let nodeConsensus: SandboxContract<NodeConsensus>;
    let tonNodeManager: SandboxContract<TonNodeManager>;
    let token: SandboxContract<NodeCoin>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury("deployer");

        // deploy ton node manage
        tonNodeManager = blockchain.openContract(
            await TonNodeManager.fromInit(deployer.address),
        );
        const tonNMDeploy = await tonNodeManager.send(
            deployer.getSender(),
            {
                value: toNano("0.05"),
            },
            {
                $$type: "Deploy",
                queryId: 0n,
            },
        );
        expect(tonNMDeploy.transactions).toHaveTransaction({
            from: deployer.address,
            to: tonNodeManager.address,
            deploy: true,
            success: true,
        });

        // deploy token
        token = blockchain.openContract(
            await NodeCoin.fromInit(deployer.address, content, max_supply),
        );
        const tDeployResult = await token.send(
            deployer.getSender(),
            { value: toNano("0.05") },
            {
                $$type: "Deploy",
                queryId: 0n,
            },
        );
        expect(tDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: token.address,
            deploy: true,
            success: true,
        });

        nodeConsensus = blockchain.openContract(
            await NodeConsensus.fromInit(
                deployer.address,
                tonNodeManager.address,
                token.address,
            ),
        );

        const deployResult = await nodeConsensus.send(
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
            to: nodeConsensus.address,
            deploy: true,
            success: true,
        });
        expect(deployResult.transactions).toHaveTransaction({
            from: nodeConsensus.address,
            to: token.address,
            success: true,
        });
        expect(deployResult.transactions).toHaveTransaction({
            from: token.address,
            to: nodeConsensus.address,
            success: true,
        });

        await tonNodeManager.send(
            deployer.getSender(),
            { value: toNano("123") },
            {
                $$type: "ChangeConsensusAddress",
                newConsensus: nodeConsensus.address,
            },
        );

        await token.send(
            deployer.getSender(),
            { value: toNano("123") },
            {
                $$type: "AddNewMinter",
                new_minter_address: nodeConsensus.address,
            },
        );

        blockchain.now = deployResult.transactions[1].now;
    });

    it("should deploy", async () => {
        // the check is done inside beforeEach
        // blockchain and nodeConsensus are ready to use
    });

    it("should set the Node instances index, asking NodeManager", async () => {
        const initialValue = await nodeConsensus.getCurrentInstancesIndex();
        expect(initialValue).toBe<BigInt>(0n);

        function checkIfTxsAreCorrect(txs: BlockchainTransaction[]) {
            expect(txs).toHaveTransaction({
                from: deployer.address,
                to: nodeConsensus.address,
                success: true, // ChooseWinner
                body: beginCell().storeUint(0x193358f1, 32).endCell(),
            });
            expect(txs).toHaveTransaction({
                from: nodeConsensus.address,
                to: tonNodeManager.address,
                success: true, // GetInstancesIndex
                body: beginCell().storeUint(0x164a94f2, 32).endCell(),
            });
            expect(txs).toHaveTransaction({
                from: tonNodeManager.address,
                to: nodeConsensus.address,
                success: true,
                op: 0xdcbbd315, // InstanceIndex
            });
            expect(txs).toHaveTransaction({
                from: nodeConsensus.address,
                to: tonNodeManager.address,
                success: true,
                op: 0x8d8119f8, // GetInstanceInfo
            });
            expect(txs).toHaveTransaction({
                from: tonNodeManager.address,
                to: nodeConsensus.address,
                success: true,
                op: 0x8dfd4650, // InstanceAddy
            });
            expect(txs).toHaveTransaction({
                from: nodeConsensus.address,
                //to: lets commnet this, as we dont know the address of each chosen node
                success: true,
                op: 0xb33be9e4, // GetIsNodeActiveStatus
            });
        }

        const newUID = "test-uid-A";
        await tonNodeManager.send(
            deployer.getSender(),
            { value: toNano("1.1") },
            {
                $$type: "DeployNode",
                newUID: newUID + 1,
                body: {
                    $$type: "Params",
                    nodeUID: newUID + 1,
                    nodeOwner: deployer.address,
                },
            },
        );

        blockchain.now += 10;

        const tx1 = await nodeConsensus.send(
            deployer.getSender(),
            { value: toNano("0.05") },
            {
                $$type: "ChooseWinner",
            },
        );

        checkIfTxsAreCorrect(tx1.transactions);

        const value1 = await nodeConsensus.getCurrentInstancesIndex();
        expect(value1).toBe<BigInt>(initialValue + 1n);
        blockchain.now += 320;

        await tonNodeManager.send(
            deployer.getSender(),
            { value: toNano("1.1") },
            {
                $$type: "DeployNode",
                newUID: newUID + 2,
                body: {
                    $$type: "Params",
                    nodeUID: newUID + 2,
                    nodeOwner: deployer.address,
                },
            },
        );
        blockchain.now += 10;

        const tx2 = await nodeConsensus.send(
            deployer.getSender(),
            { value: toNano("0.05") },
            {
                $$type: "ChooseWinner",
            },
        );

        expect(tx2.transactions).toHaveTransaction({
            from: tonNodeManager.address,
            to: nodeConsensus.address,
            success: true,
        });

        checkIfTxsAreCorrect(tx2.transactions);
        const value2 = await nodeConsensus.getCurrentInstancesIndex();
        expect(value2.toString()).toBe((initialValue + 2n).toString());

        blockchain.now += 310;
        await tonNodeManager.send(
            deployer.getSender(),
            { value: toNano("1.1") },
            {
                $$type: "DeployNode",
                newUID: newUID + 2,
                body: {
                    $$type: "Params",
                    nodeUID: newUID + 2,
                    nodeOwner: deployer.address,
                },
            },
        );
        blockchain.now += 10;

        const deployedInstancesIndex = await tonNodeManager.getInstancesIndex();
        expect(deployedInstancesIndex.toString()).toEqual((initialValue + 3n).toString());
        blockchain.now += 10;

        const tx3 = await nodeConsensus.send(
            deployer.getSender(),
            { value: toNano("0.05") },
            {
                $$type: "ChooseWinner",
            },
        );
        expect(tx3.transactions).toHaveTransaction({
            from: tonNodeManager.address,
            to: nodeConsensus.address,
            success: true,
        });

        checkIfTxsAreCorrect(tx3.transactions);
        const newValue2 = await nodeConsensus.getCurrentInstancesIndex();
        expect(newValue2.toString()).toBe(deployedInstancesIndex.toString());
    });

    it("should send winner nodes their rewards", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");
        const notDeployer2 = await blockchain.treasury("notDeployer2");
        const notDeployer3 = await blockchain.treasury("notDeployer3");
        const notDeployer4 = await blockchain.treasury("notDeployer4");
        const notDeployer5 = await blockchain.treasury("notDeployer5");

        const newNodeUID = "test-id-";
        let nodeIndex = 1;
        const usersArray = [
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

        const tx1 = await nodeConsensus.send(
            deployer.getSender(),
            { value: toNano("0.1") },
            {
                $$type: "ChooseWinner",
            },
        );

        const consultedNode1 = await nodeConsensus.getLastConsultedNodeId();
        const winnerNodeInfo1 = await tonNodeManager.getInstanceInfoPerIndex(consultedNode1);
        const winnerNodeAddress1 = await token.getGetWalletAddress(winnerNodeInfo1.Address);
        const winnerWallet1 = blockchain.openContract(
            NodeCoinWallet.fromAddress(winnerNodeAddress1),
        );

        expect(tx1.transactions).toHaveTransaction({
            from: nodeConsensus.address,
            to: token.address,
            success: true,
        });
        expect(tx1.transactions).toHaveTransaction({
            from: token.address,
            to: winnerNodeAddress1,
            success: true,
            deploy: true,
        });

        const tokenDataAfterTx = await token.getGetJettonData();
        expect(
            tokenDataAfterTx.total_supply.toString() == toNano("5").toString(),
        ).toBeTruthy();

        const winnerBalance1 = (await winnerWallet1.getGetWalletData()).balance;
        expect(winnerBalance1 == toNano("5")).toBeTruthy();
        blockchain.now += 320;

        const tx2 = await nodeConsensus.send(
            deployer.getSender(),
            { value: toNano("0.1") },
            {
                $$type: "ChooseWinner",
            },
        );

        const consultedNode2 = await nodeConsensus.getLastConsultedNodeId();
        const winnerNodeInfo2 = await tonNodeManager.getInstanceInfoPerIndex(consultedNode2);
        const winnerNodeAddress2 = await token.getGetWalletAddress(winnerNodeInfo2.Address);
        const winnerWallet2 = blockchain.openContract(
            NodeCoinWallet.fromAddress(winnerNodeAddress2),
        );

        expect(tx2.transactions).toHaveTransaction({
            from: nodeConsensus.address,
            to: token.address,
            success: true,
        });

        if (winnerNodeAddress2.toString() != winnerNodeAddress1.toString()) {
            expect(tx2.transactions).toHaveTransaction({
                from: token.address,
                to: winnerNodeAddress2,
                success: true,
                deploy: true,
            });
        }

        const tokenDataAfterTx2 = await token.getGetJettonData();
        const newvalue =
            winnerNodeAddress2.toString() == winnerNodeAddress1.toString() ? "10" : "5";
        expect(
            tokenDataAfterTx2.total_supply.toString() == toNano("10").toString(),
        ).toBeTruthy();

        const winnerBalance2 = (await winnerWallet2.getGetWalletData()).balance;
        expect(winnerBalance2 == toNano(newvalue)).toBeTruthy();
    });

    it("should pick another winner if the selected node is not active", async () => {
        const notDeployer = await blockchain.treasury("notDeployer");

        const newNodeUID = "test-id-";

        for (let index = 0; index < 5; index++) {
            await tonNodeManager.send(
                notDeployer.getSender(),
                { value: toNano("1.1") },
                {
                    $$type: "DeployNode",
                    newUID: newNodeUID + (index + 1),
                    body: {
                        $$type: "Params",
                        nodeUID: newNodeUID,
                        nodeOwner: notDeployer.address,
                    },
                },
            );

            blockchain.now += 10;
        }

        blockchain.now += 60 * 60 * 25;

        const tx1 = await nodeConsensus.send(
            deployer.getSender(),
            { value: toNano("0.5") },
            {
                $$type: "ChooseWinner",
            },
        );

        const externalsPerTx1: ExternalOut[][] = tx1.transactions.map((tx): ExternalOut[] => {
            return tx.externals;
        });

        externalsPerTx1.forEach((et: ExternalOut[], index: number) => {
            et.forEach((ex: ExternalOut, subIndex: Number) => {
                const body = ex.body;

                const msg = body.asSlice().loadStringTail();
                if (index <= 3) {
                    if (subIndex == 0) {
                        expect(msg == `Attempt number ${index + 1} to pick a winner`);
                    } else {
                        expect(msg == `Failed to pick a valid node! Retrying...`);
                    }
                } else {
                    expect(msg == `Failed to pick a valid node! Try again later`);
                }
            });
        });

        for (let index = 0; index < 5; index++) {
            await tonNodeManager.send(
                notDeployer.getSender(),
                { value: toNano("1.123") },
                {
                    $$type: "RefillNode",
                    nodeInstance: BigInt(index + 1),
                },
            );

            blockchain.now += 10;
        }

        blockchain.now += 320;

        const tx2 = await nodeConsensus.send(
            deployer.getSender(),
            { value: toNano("0.5") },
            {
                $$type: "ChooseWinner",
            },
        );

        expect(tx2.transactions).toHaveTransaction({
            from: nodeConsensus.address,
            to: token.address,
            success: true,
        });

        const winnerBody = tx2.transactions[7].externals[1].body;
        const winnerMsg = winnerBody.asSlice().loadStringTail();

        expect(winnerMsg.includes("chosen!")).toBeTruthy();

        const consultedNode1 = await nodeConsensus.getLastConsultedNodeId();
        const winnerNodeInfo1 = await tonNodeManager.getInstanceInfoPerIndex(consultedNode1);
        const winnerNodeAddress1 = await token.getGetWalletAddress(winnerNodeInfo1.Address);
        const winnerWallet1 = blockchain.openContract(
            NodeCoinWallet.fromAddress(winnerNodeAddress1),
        );

        expect(tx2.transactions).toHaveTransaction({
            from: token.address,
            to: winnerNodeAddress1,
            success: true,
            deploy: true,
        });

        const winnerBalance1 = (await winnerWallet1.getGetWalletData()).balance;
        // @note here we *2 the result, to match the current multiplier
        expect(winnerBalance1 == toNano("5") * 2n).toBeTruthy();
    });
});
