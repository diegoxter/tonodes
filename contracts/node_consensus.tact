import "@stdlib/deploy";
import "./ton_node_manager.tact";
import "./ton_node.tact";

message ChooseWinner{
}

contract NodeConsensus with Deployable {
    owner: Address;
    nodeManager: Address;
    currentInstancesIndex: Int;
    lastConsensusReachedIn: Int as uint64 = 0;
    minutesForNextConsensus: Int as uint8 = 5;
    lastConsultedNode: Address = newAddress(0, 0x0000000000000000000000000000000000000000000000000000000000000000);

    init(owner: Address, nodeManager: Address) {
        self.owner = owner;
        self.nodeManager = nodeManager;
        self.currentInstancesIndex = 0;
    }

    receive(msg: InstanceIndex) {
        require(sender() == self.nodeManager, "InstanceIndex: Unauthorized");
        self.currentInstancesIndex = msg.index;

        self.getInstanceInfo(msg.index);
    }

    receive(msg: InstanceAddy) {
        require(sender() == self.nodeManager, "InstanceIndex: Unauthorized");

        let instanceAddress: Address = msg.instanceAddy;
        self.lastConsultedNode = msg.instanceAddy;

        send(SendParameters{
            to: instanceAddress,
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors,
            body: GetIsNodeActiveStatus{}.toCell(),
        });
    }


    receive(_: ChooseWinner){
        require(now() >= self.lastConsensusReachedIn + (60 * self.minutesForNextConsensus),
           "chooseWinner: must be at least five minutes after the last consensus");
        send(SendParameters{
            to: self.nodeManager,
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors,
            body: GetInstancesIndex{}.toCell(),
        });
    }

    receive(msg: NodeActiveStatus) {
        require(sender() == self.lastConsultedNode, "nodeActiveStatus: Unauthorized");
        if (msg.isActive) {
            dump("is active");


            self.lastConsensusReachedIn = now();
        } else {
            dump("is not active");

            self.getInstanceInfo(self.currentInstancesIndex);
        }
    }

    fun getInstanceInfo(instancesIndex: Int) {
        let chosen: Int = random(1, instancesIndex);

        send(SendParameters{
            to: self.nodeManager,
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors,
            body: GetInstanceInfo{instanceIndex: chosen}.toCell(),
        });
    }

    get fun currentInstancesIndex(): Int {
        return self.currentInstancesIndex;
    }
}
