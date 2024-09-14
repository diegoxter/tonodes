import "@stdlib/deploy";
import "./ton_node";

message DeployNode {
    newUID: String;
    body: Params;
}

message ChangeDeployCost {
    newCost: Int;
}

message RefillNode {
    nodeInstance: Int;
}

struct NodeInstance {
    UID: String;
    Address: Address;
    Owner: Address;
}


contract TonNodeManager with Deployable {
    owner: Address;
    balance: Int as uint64 = 0;
    deployCost: Int = ton("1");
    instancesIndex: Int = 0;
    instances: map<Int, NodeInstance> = emptyMap();
    instancesPerAddres: map<Address, Int> = emptyMap();


    init(owner: Address) {
        self.owner = owner;
    }

    receive("withdraw") {
        require(sender() == self.owner, "withdraw: not authorized");
    }

   receive(msg: ChangeDeployCost) {
        require(sender() == self.owner, "changeDeployCost: not authorized");
        require(msg.newCost >= ton("1"), "changeDeployCost: new amount too low");

        self.deployCost = msg.newCost;
    }

    receive(msg: DeployNode) {
        let ctx: Context = context();
        require(ctx.value == self.deployCost, "deployNode: invalid amount of Toncoins");

        let init: StateInit = self.getNodeStateInit(msg.newUID, sender());
        let newNodeAddress: Address = contractAddress(init);
        let currentInstance: Int = self.instancesIndex + 1;

        send(SendParameters{
            to: newNodeAddress,
            value: 0,
            bounce: false,
            mode: SendRemainingValue,
            body: NodeInit{body: msg.body}.toCell(),
            code: init.code,
            data: init.data
        });

        self.instances.set(currentInstance, NodeInstance{
            UID: msg.newUID,
            Address: newNodeAddress,
            Owner: sender(),
        });

        self.instancesPerAddres.set(sender(), currentInstance);

        self.instancesIndex = currentInstance;
    }

    receive(msg: RefillNode) {
        let ctx: Context = context();
        require(ctx.value >= self.deployCost, "refillNode: value sent not enough for a refill");
        require(msg.nodeInstance <= self.instancesIndex, "refillNode: invalid node index");

        let refilledInstance: NodeInstance = self.instances.get(msg.nodeInstance)!!;
        require(sender() == refilledInstance.Owner, "refillNode: not the owner of the node");

        send(SendParameters{
            to: refilledInstance.Address,
            value:  ton("0.01"),
            bounce: false,
            mode: SendPayGasSeparately,
            body: Refill{amountOfDays: 1}.toCell(),
        });
    }

    fun getNodeStateInit(uid: String, nodeOwner: Address): StateInit {
        return initOf TonNode(uid, myAddress(), nodeOwner, now());
    }

    get fun instancesIndex(): Int {
        return self.instancesIndex;
    }

    get fun instanceInfoPerIndex(index: Int): NodeInstance? {
        return self.instances.get(index)
    }

    get fun instancesPerUser(user: Address): map<Int, NodeInstance> {
       let instancesArray: map<Int, NodeInstance> = emptyMap();

       foreach (key, value in self.instancesPerAddres) {
           if (key == user) {
                instancesArray.set(value, self.instances.get(value));
           }
       }

       return instancesArray;
    }

    get fun owner(): Address {
       return self.owner;
    }

    get fun deployCost(): Int {
        return self.deployCost;
    }

    get fun balance(): Int {
        require(sender() == self.owner, "getBalance: not authorized");
        return myBalance()
    }
}
