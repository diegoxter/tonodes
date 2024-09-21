import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { beginCell, toNano } from "@ton/core";
import { NodeCoinWallet, JettonBurn, JettonTransfer } from "../wrappers/NodeCoinWallet";
import { NodeCoin } from "../wrappers/NodeCoin";
import "@ton/test-utils";
import { buildOnchainMetadata } from "../scripts/jetton-helpers";

const jettonParams = {
    name: "NodeCoin",
    description: "The coin of your favorite Node provider",
    symbol: "NCOI",
    image: "https://play-lh.googleusercontent.com/ahJtMe0vfOlAu1XJVQ6rcaGrQBgtrEZQefHy7SXB7jpijKhu1Kkox90XDuH8RmcBOXNn",
};
let content = buildOnchainMetadata(jettonParams);
let max_supply = toNano(21000000n);

describe("NodeCoin", () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let deployer: SandboxContract<TreasuryContract>;
    let jettonMaster: SandboxContract<NodeCoin>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        owner = await blockchain.treasury("owner");
        deployer = await blockchain.treasury("deployer");
        jettonMaster = blockchain.openContract(
            await NodeCoin.fromInit(deployer.address, content, max_supply),
        );
        const deployResult = await jettonMaster.send(
            owner.getSender(),
            {
                value: toNano("0.05"),
            },
            {
                $$type: "Deploy",
                queryId: 0n,
            },
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: owner.address,
            to: jettonMaster.address,
            deploy: true,
            success: true,
        });
    });

    it("should deploy", async () => {
        // the check is done inside beforeEach
        // blockchain and nodecoin are ready to use
    });

    it("should mint 100 tokens to deployer", async () => {
        // Mint 100 tokens to deployer
        const mintyResult = await jettonMaster.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            "Mint: 100",
        );
        //printTransactionFees(mintyResult.transactions);

        // Check that deployer send "Mint: 100" msg to JettonMaster
        expect(mintyResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMaster.address,
            success: true,
        });

        // Check that JettonMaster send 100 tokens to deployer's jetton wallet
        const deployerWalletAddress = await jettonMaster.getGetWalletAddress(deployer.address);
        expect(mintyResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: deployerWalletAddress,
            success: true,
        });

        // Check that deployer's jetton wallet send JettonExcesses msg to deployer
        expect(mintyResult.transactions).toHaveTransaction({
            from: deployerWalletAddress,
            to: deployer.address,
            success: true,
        });

        // Check that deployer's jetton wallet balance is 1
        const deployerJettonContract = blockchain.openContract(
            NodeCoinWallet.fromAddress(deployerWalletAddress),
        );
        const deployerBalanceAfter = (await deployerJettonContract.getGetWalletData()).balance;
        expect(deployerBalanceAfter).toEqual(toNano("100"));
    });

    it("should deployer send 10 tokens to Bob", async () => {
        // Mint 100 tokens to deployer first to build her jetton wallet
        await jettonMaster.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            "Mint: 100",
        );
        // deployer's jetton wallet address
        const deployerWalletAddress = await jettonMaster.getGetWalletAddress(deployer.address);
        // deployer's jetton wallet
        const deployerJettonContract = blockchain.openContract(
            NodeCoinWallet.fromAddress(deployerWalletAddress),
        );

        // Mint 100 tokens to Bob first to build his jetton wallet
        const bob = await blockchain.treasury("bob");
        const mintyResult = await jettonMaster.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            { $$type: "MintAmountTo", to: bob.address, amount: toNano("100") },
        );
        // Bob's jetton wallet address
        const bobWalletAddress = await jettonMaster.getGetWalletAddress(bob.address);
        // Bob's jetton wallet
        const bobJettonContract = blockchain.openContract(
            NodeCoinWallet.fromAddress(bobWalletAddress),
        );

        expect(mintyResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: bobWalletAddress,
            success: true,
        });
        expect(mintyResult.transactions).toHaveTransaction({
            from: bobWalletAddress,
            to: deployer.address,
            success: true,
        });

        const bobBalanceBefore = (await bobJettonContract.getGetWalletData()).balance;
        // deployer transfer 10 tokens to Bob
        const jettonTransfer: JettonTransfer = {
            $$type: "JettonTransfer",
            query_id: 0n,
            amount: 10n,
            destination: bob.address,
            response_destination: bob.address,
            custom_payload: null,
            forward_ton_amount: 0n,
            forward_payload: beginCell().endCell().asSlice(),
        };
        const transfterResult = await deployerJettonContract.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            jettonTransfer,
        );
        //printTransactionFees(transfterResult.transactions);

        // Check that deployer send JettonTransfer msg to her jetton wallet
        expect(transfterResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerWalletAddress,
            success: true,
        });

        // Check that deployer's jetton wallet send JettonInternalTransfer msg to Bob's jetton wallet
        expect(transfterResult.transactions).toHaveTransaction({
            from: deployerWalletAddress,
            to: bobWalletAddress,
            success: true,
        });

        // Check that Bob's jetton wallet send JettonExcesses msg to Bob
        expect(transfterResult.transactions).toHaveTransaction({
            from: bobWalletAddress,
            to: bob.address,
            success: true,
        });

        // Check that Bob's jetton wallet balance is added 1
        const bobBalanceAfter = (await bobJettonContract.getGetWalletData()).balance;
        expect(bobBalanceAfter).toEqual(bobBalanceBefore + 10n);

        const deployerBalanceAfter = (await deployerJettonContract.getGetWalletData()).balance;
        expect(deployerBalanceAfter).toEqual(toNano("100") - 10n);
    });

    it("should deployer burn 10 tokens", async () => {
        // Mint 100 tokens to deployer first to build her jetton wallet
        await jettonMaster.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            "Mint: 100",
        );

        const jettonBurn: JettonBurn = {
            $$type: "JettonBurn",
            query_id: 0n,
            amount: 10n,
            response_destination: deployer.address,
            custom_payload: null,
        };

        // deployer's jetton wallet address
        const deployerWalletAddress = await jettonMaster.getGetWalletAddress(deployer.address);
        // deployer's jetton wallet
        const deployerJettonContract = blockchain.openContract(
            NodeCoinWallet.fromAddress(deployerWalletAddress),
        );
        // deployer's jetton wallet balance before burning
        const deployerBalanceBefore = (await deployerJettonContract.getGetWalletData())
            .balance;

        // deployer burn 10 tokens
        const burnResult = await deployerJettonContract.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            jettonBurn,
        );
        //printTransactionFees(burnResult.transactions);

        // Check that deployer send JettonBurn msg to her jetton wallet
        expect(burnResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerWalletAddress,
            success: true,
        });

        // Check that deployer's jetton wallet send JettonBurnNotification msg to JettonMaster
        expect(burnResult.transactions).toHaveTransaction({
            from: deployerWalletAddress,
            to: jettonMaster.address,
            success: true,
        });

        // Check that JettonMaster send JettonExcesses msg to deployer
        expect(burnResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: deployer.address,
            success: true,
        });

        // Check that deployer's jetton wallet balance is subtracted 1
        const deployerBalanceAfter = (await deployerJettonContract.getGetWalletData()).balance;
        expect(deployerBalanceAfter).toEqual(deployerBalanceBefore - 10n);
    });

    it("should respect contract ownership", async () => {
        const bob = await blockchain.treasury("bob");
        const mintyResult = await jettonMaster.send(
            bob.getSender(),
            {
                value: toNano("1"),
            },
            { $$type: "MintAmountTo", to: bob.address, amount: toNano("100") },
        );

        // Bob's jetton wallet address
        //const bobWalletAddress = await jettonMaster.getGetWalletAddress(bob.address);
        //// Bob's jetton wallet
        //const bobJettonContract = blockchain.openContract(
        //    NodeCoinWallet.fromAddress(bobWalletAddress),
        //);

        expect(mintyResult.transactions).toHaveTransaction({
            from: bob.address,
            to: jettonMaster.address,
            success: false,
            exitCode: 54822, // not authorized
        });

        const addMinterResult = await jettonMaster.send(
            bob.getSender(),
            {
                value: toNano("1"),
            },
            { $$type: "AddNewMinter", new_minter_address: bob.address },
        );

        expect(addMinterResult.transactions).toHaveTransaction({
            from: bob.address,
            to: jettonMaster.address,
            success: false,
            exitCode: 5582, // not authorized
        });
    });

    it("should handle minter role", async () => {
        const bob = await blockchain.treasury("bob");
        const addMinterResult = await jettonMaster.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            { $$type: "AddNewMinter", new_minter_address: bob.address },
        );

        expect(addMinterResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMaster.address,
            success: true,
            op: 0xc148c22d,
        });

        const mintyResult = await jettonMaster.send(
            bob.getSender(),
            {
                value: toNano("1"),
            },
            { $$type: "MintAmountTo", to: bob.address, amount: toNano("100") },
        );

        // Bob's jetton wallet address
        const bobWalletAddress = await jettonMaster.getGetWalletAddress(bob.address);
        // Bob's jetton wallet
        const bobJettonContract = blockchain.openContract(
            NodeCoinWallet.fromAddress(bobWalletAddress),
        );

        expect(mintyResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: bobWalletAddress,
            success: true,
        });
        expect(mintyResult.transactions).toHaveTransaction({
            from: bobWalletAddress,
            to: bob.address,
            success: true,
        });

        const bobBalanceBefore = (await bobJettonContract.getGetWalletData()).balance;
        expect(bobBalanceBefore).toEqual(toNano("100"));

        const removeMinterResult = await jettonMaster.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            { $$type: "RemoveMinter", minter: bob.address },
        );
        expect(removeMinterResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMaster.address,
            success: true,
            op: 0x9bdeb88f,
        });

        const newMintyResult = await jettonMaster.send(
            bob.getSender(),
            {
                value: toNano("1"),
            },
            { $$type: "MintAmountTo", to: bob.address, amount: toNano("100") },
        );

        expect(newMintyResult.transactions).toHaveTransaction({
            from: bob.address,
            to: jettonMaster.address,
            success: false,
            exitCode: 54822, // not authorized
        });
    });

    it("should not mint more than the max_supply", async () => {
        const mintyResult = await jettonMaster.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            {
                $$type: "MintAmountTo",
                to: deployer.address,
                amount: max_supply - 100n,
            },
        );

        const deployerWalletAddress = await jettonMaster.getGetWalletAddress(deployer.address);
        const deployerJettonContract = blockchain.openContract(
            NodeCoinWallet.fromAddress(deployerWalletAddress),
        );

        expect(mintyResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: deployerWalletAddress,
            success: true,
        });
        expect(mintyResult.transactions).toHaveTransaction({
            from: deployerWalletAddress,
            to: deployer.address,
            success: true,
        });
        const deployerBalanceBefore = (await deployerJettonContract.getGetWalletData())
            .balance;
        expect(deployerBalanceBefore).toEqual(max_supply - 100n);

        const newMintyResult1 = await jettonMaster.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            {
                $$type: "MintAmountTo",
                to: deployer.address,
                amount: 101n,
            },
        );
        expect(newMintyResult1.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMaster.address,
            success: false,
            exitCode: 61902,
        });

        const newMintyResult2 = await jettonMaster.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            {
                $$type: "MintAmountTo",
                to: deployer.address,
                amount: 100n,
            },
        );
        expect(newMintyResult2.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: deployerWalletAddress,
            success: true,
        });
        expect(newMintyResult2.transactions).toHaveTransaction({
            from: deployerWalletAddress,
            to: deployer.address,
            success: true,
        });
        const deployerBalanceAfter = (await deployerJettonContract.getGetWalletData()).balance;
        expect(deployerBalanceAfter).toEqual(max_supply);

        const newMintyResult3 = await jettonMaster.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            {
                $$type: "MintAmountTo",
                to: deployer.address,
                amount: 1n,
            },
        );
        expect(newMintyResult3.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMaster.address,
            success: false,
            exitCode: 61902,
        });
    });

    it("should correctly track the mintable state", async () => {
        const pauseResult = await jettonMaster.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            "Toggle pause",
        );
        expect(pauseResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMaster.address,
            success: true,
        });

        const mintyResult1 = await jettonMaster.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            {
                $$type: "MintAmountTo",
                to: deployer.address,
                amount: max_supply - 100n,
            },
        );
        expect(mintyResult1.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMaster.address,
            success: false,
            exitCode: 30061,
        });

        const unpauseResult = await jettonMaster.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            "Toggle pause",
        );
        expect(unpauseResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMaster.address,
            success: true,
        });

        const mintyResult2 = await jettonMaster.send(
            deployer.getSender(),
            {
                value: toNano("1"),
            },
            {
                $$type: "MintAmountTo",
                to: deployer.address,
                amount: 100n,
            },
        );

        const deployerWalletAddress = await jettonMaster.getGetWalletAddress(deployer.address);
        const deployerJettonContract = blockchain.openContract(
            NodeCoinWallet.fromAddress(deployerWalletAddress),
        );
        const deployerBalanceAfter = (await deployerJettonContract.getGetWalletData()).balance;
        expect(deployerBalanceAfter).toEqual(100n);

        expect(mintyResult2.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMaster.address,
            success: true,
        });
        expect(mintyResult2.transactions).toHaveTransaction({
            from: deployerWalletAddress,
            to: deployer.address,
            success: true,
        });
    });
});
