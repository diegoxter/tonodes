import { CompilerConfig } from "@ton/blueprint";

export const compile: CompilerConfig = {
    lang: "tact",
    target: "contracts/ton_node_manager.tact",
    options: {
        debug: true,
    },
};
