import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tact',
    target: 'contracts/node_consensus.tact',
    options: {
        debug: true,
    },
};
