import { toNano } from "@ton/core";
import { TonNode } from "../wrappers/TonNode";
import { NetworkProvider } from "@ton/blueprint";

export async function run(provider: NetworkProvider) {
    const tonNode = provider.open(
        await TonNode.fromInit(BigInt(Math.floor(Math.random() * 10000))),
    );

    await tonNode.send(
        provider.sender(),
        {
            value: toNano("0.05"),
        },
        {
            $$type: "Deploy",
            queryId: 0n,
        },
    );

    await provider.waitForDeploy(tonNode.address);

    console.log("ID", await tonNode.getId());
}
