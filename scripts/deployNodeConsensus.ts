import { toNano, address, type Address } from "@ton/core";
import { NodeConsensus } from "../wrappers/NodeConsensus";
import { NetworkProvider } from "@ton/blueprint";

const tonNodeAddress: Address = address("EQC0bm6h5SIWy4kD_VKpT-21fSu0OvGLvjzrAvypf7HU0G4e");
const owner: Address = address("UQCOqkZj4H0lg5RgCzV5jxGmCF6XFiQDUrkpZOU9-DVNPipH");

export async function run(provider: NetworkProvider) {
    const nodeConsensus = provider.open(await NodeConsensus.fromInit(owner, tonNodeAddress));
    // EQA-qeB1UekYppoGJlnBpDABrRZQV-BIVT78MBnmY6ykU7ly
    await nodeConsensus.send(
        provider.sender(),
        {
            value: toNano("0.05"),
        },
        {
            $$type: "Deploy",
            queryId: 0n,
        },
    );

    await provider.waitForDeploy(nodeConsensus.address);

    // run methods on `nodeConsensus`
}
