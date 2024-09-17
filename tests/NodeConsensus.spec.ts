import {
    Blockchain,
    BlockchainTransaction,
    SandboxContract,
    TreasuryContract,
} from "@ton/sandbox";
import { toNano, beginCell } from "@ton/core";
import { NodeConsensus } from "../wrappers/NodeConsensus";
import { TonNodeManager } from "../wrappers/TonNodeManager";
import "@ton/test-utils";

describe("NodeConsensus", () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let nodeConsensus: SandboxContract<NodeConsensus>;
    let tonNodeManager: SandboxContract<TonNodeManager>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury("deployer");
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

        nodeConsensus = blockchain.openContract(
            await NodeConsensus.fromInit(deployer.address, tonNodeManager.address),
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

        await tonNodeManager.send(
            deployer.getSender(),
            { value: toNano("123") },
            {
                $$type: "ChangeConsensusAddress",
                newConsensus: nodeConsensus.address,
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
            { value: toNano("1") },
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
            { value: toNano("1") },
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
            { value: toNano("1") },
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
});
