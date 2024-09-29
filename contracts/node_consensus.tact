import "@stdlib/deploy";
import "./ton_node_manager.tact";
import "./ton_node.tact";
import "./ncoin.tact";


contract NodeConsensus with Deployable {
    ///////////////////////////////////
    // Just for the first deployment //
    ///////////////////////////////////
    zeroWallet: Address = newAddress(0, 0x0000000000000000000000000000000000000000000000000000000000000000);
    /////////..........................
    owner: Address;
    nodeManager: Address;
    ncoin: Address;
    ncoinWallet: Address;
    currentInstancesIndex: Int;
    lastConsensusReachedIn: Int as uint64 = 0;
    minutesForNextConsensus: Int as uint8 = 5;
    lastConsultedNodeAddress: Address;
    lastConsultedNodeID: Int = 0;
    attempts: Int = 0;
    multiplier: Int = 1;

    init(owner: Address, nodeManager: Address, ncoin: Address) {
        self.owner = owner;
        self.nodeManager = nodeManager;
        self.currentInstancesIndex = 0;
        self.ncoin = ncoin;

        self.lastConsultedNodeAddress = self.zeroWallet;
        self.ncoinWallet = self.zeroWallet;

        send(SendParameters{
            to: ncoin,
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors,
            body: GetNodeConsensusWallet{}.toCell(),
        });

    }

    receive("ChooseWinner"){
        require(now() >= self.lastConsensusReachedIn + (60 * self.minutesForNextConsensus),
           "chooseWinner: must be at least five minutes after the last consensus");

        send(SendParameters{
            to: self.nodeManager,
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors,
            body: "GetInstancesIndex".asComment(),
        });
    }

    receive(msg: InstanceAddy) {
        require(sender() == self.nodeManager, "InstanceIndex: Unauthorized");

        let instanceAddress: Address = msg.instanceAddy;
        self.lastConsultedNodeAddress = msg.instanceAddy;

        send(SendParameters{
            to: instanceAddress,
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors,
            body: GetIsNodeActiveStatus{}.toCell(),
        });
    }

    receive(msg: InstanceIndex) {
        require(sender() == self.nodeManager, "InstanceIndex: Unauthorized");
        self.currentInstancesIndex = msg.index;

        self.getInstanceInfo(msg.index);
    }

    receive(msg: NodeActiveStatus) {
        require(sender() == self.lastConsultedNodeAddress, "nodeActiveStatus: Unauthorized");

        let emit_msg: StringBuilder = beginString();
        emit_msg.append("Attempt number ");
        emit_msg.append((self.attempts + 1).toString());
        emit_msg.append(" to pick a winner.");
        emit(emit_msg.toCell());

        if (msg.isActive) {
            send(SendParameters{
                to: self.ncoin,
                value: 0,
                mode: SendRemainingValue + SendIgnoreErrors,
                body: MintAmountTo{
                    to: self.lastConsultedNodeAddress,
                    amount: ton("5") * self.multiplier
                }.toCell(),
            });

            self.lastConsensusReachedIn = now();

            if (self.attempts > 0) {
                self.attempts = 0;
            }

            if (self.multiplier > 1) {
                self.multiplier = 1;
            }

            emit("A winner was chosen!".asComment());
        } else {
            self.attempts = self.attempts + 1;

            if (self.attempts == 3) {
                self.attempts = 0;
                self.lastConsensusReachedIn = now();
                self.multiplier = self.multiplier + 1;

                // We give up :(
                emit("Failed to pick a valid node! Try again later".asComment());
            } else {
                emit("Failed to pick a valid node! Retrying...".asComment());

                self.getInstanceInfo(self.currentInstancesIndex);
            }
        }
    }

    receive(msg: NodeConsensusWallet) {
        require(sender() == self.ncoin, "NodeConsensusWallet: Unauthorized");
        require(self.ncoinWallet == self.zeroWallet, "NodeConsensusWallet: Already set");

        self.ncoinWallet = msg.jettonWallet;
    }

    receive("ncoin") {
        self.reply(Ncoin{nCoin:self.ncoin}.toCell());
    }

    fun getInstanceInfo(instancesIndex: Int) {
        let chosen: Int = random(1, instancesIndex);
        self.lastConsultedNodeID = chosen;

        send(SendParameters{
            to: self.nodeManager,
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors,
            body: GetInstanceInfo{instanceIndex: chosen}.toCell(),
        });
    }

    get fun nwallet(): Address {
        return self.ncoinWallet;
    }

    get fun currentInstancesIndex(): Int {
        return self.currentInstancesIndex;
    }

    get fun lastConsultedNodeAddress(): Address {
        return self.lastConsultedNodeAddress;
    }

    get fun lastConsultedNodeID(): Int {
        return self.lastConsultedNodeID;
    }
}
