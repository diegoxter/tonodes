import { toNano, type Address } from "@ton/core";
import { TonNodeManager } from "../wrappers/TonNodeManager";
import { NetworkProvider } from "@ton/blueprint";

const owner: Address = ""; // TO DO update this

export async function run(provider: NetworkProvider) {
    const tonNodeManager = provider.open(await TonNodeManager.fromInit(owner));

    await tonNodeManager.send(
        provider.sender(),
        {
            value: toNano("0.05"),
        },
        {
            $$type: "Deploy",
            queryId: 0n,
        },
    );

    await provider.waitForDeploy(tonNodeManager.address);

    // run methods on `nodeConsensus`
}
