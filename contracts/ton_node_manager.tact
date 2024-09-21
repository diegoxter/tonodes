import "@stdlib/deploy";
import "./ton_node";

message DeployNode {
    newUID: String;
    body: Params;
}

message ChangeDeployCost {
    newCost: Int;
}

message CollectReward {
    forAll: Bool;
    nodeID: Int?;
}

message RefillNode {
    nodeInstance: Int;
}

struct NodeInstance {
    UID: String;
    Address: Address;
    Owner: Address;
}

message GetInstancesIndex {
}

message GetInstanceInfo {
    instanceIndex: Int
}

message InstanceIndex {
    index: Int;
}

message InstanceAddy {
    instanceAddy: Address
}

message ChangeConsensusAddress {
    newConsensus: Address;
}

message Withdraw{
}

message Ncoin{
    nCoin: Address;
}


contract TonNodeManager with Deployable {
    owner: Address;
    consensus: Address = newAddress(0, 0x0000000000000000000000000000000000000000000000000000000000000000);
    ncoin: Address;
    balance: Int as uint64 = 0;
    deployCost: Int = ton("1");
    instancesIndex: Int = 0;
    instances: map<Int, NodeInstance> = emptyMap();
    instancesPerAddres: map<Address, Int> = emptyMap();

    init(owner: Address) {
        self.owner = owner;
        self.ncoin = self.consensus;
    }

   receive(msg: ChangeDeployCost) {
        require(sender() == self.owner, "changeDeployCost: not authorized");
        require(msg.newCost >= ton("1"), "changeDeployCost: new amount too low");

        self.deployCost = msg.newCost;
   }

   receive(msg: ChangeConsensusAddress) {
        require(sender() == self.owner, "changeConsensusAddress: not authorized");

        self.consensus = msg.newConsensus;

        send(SendParameters{
            to: msg.newConsensus,
            value: 0,
            bounce: false,
            mode: SendRemainingValue ,
            body: "ncoin".asComment(),
        });
   }

    receive(msg: DeployNode) {
        let ctx: Context = context();
        require(ctx.value == self.deployCost + ton("0.1"), "deployNode: invalid amount of Toncoins");

        let init: StateInit = self.getNodeStateInit(msg.newUID, sender());
        let newNodeAddress: Address = contractAddress(init);
        let currentInstance: Int = self.instancesIndex + 1;

        send(SendParameters{
            to: newNodeAddress,
            value: ton("0.1"),
            bounce: false,
            mode: 0,
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
        require(ctx.value >= self.deployCost + ton("0.023"),
            "refillNode: value sent not enough for a refill");
        require(msg.nodeInstance <= self.instancesIndex, "refillNode: invalid node index");

        let refilledInstance: NodeInstance = self.instances.get(msg.nodeInstance)!!;
        require(sender() == refilledInstance.Owner, "refillNode: not the owner of the node");

        send(SendParameters{
            to: refilledInstance.Address,
            value: 0,
            bounce: false,
            mode: SendRemainingValue,
            body: Refill{amountOfDays: 1}.toCell(),
        });
    }

    receive(_: GetInstancesIndex) {
        require(sender() == self.consensus, "getInstancesIndex: Unauthorized");

        self.reply(InstanceIndex{index: self.instancesIndex}.toCell());
    }

    receive(msg: GetInstanceInfo) {
        require(sender() == self.consensus, "getInstancesInfo: Unauthorized");
        require(msg.instanceIndex <= self.instancesIndex, "getInstancesInfo: invalid node index");
        let notSureIfExists: NodeInstance? = self.instances.get(msg.instanceIndex);

        if (notSureIfExists != null) {
            let itExists: NodeInstance = self.instances.get(msg.instanceIndex)!!;

            self.reply(InstanceAddy{instanceAddy: itExists.Address}.toCell());
        } else {
            dump("error?");
        }
    }

    // @note for the NodeManager owner to withdraw the collected TON
    receive(_: Withdraw) {
        require(sender() == self.owner, "withdraw: not authorized");
        send(SendParameters{
            to: sender(),
            bounce: true,
            value: myBalance() - context().value - ton("0.01"),
            mode: SendRemainingValue + SendIgnoreErrors
        });
    }

    receive(msg: CollectReward) {
        if (msg.forAll == true) {
            let nodes: map<Int, NodeInstance> = self._instancesPerUser(sender());

           foreach (key, _ in nodes) {
               self._collectNodeRewards(key);
           }

        } else {
            require(msg.nodeID != null, "CollectReward: invalid NodeID");
            let nodeID: Int = msg.nodeID!!;
            require(nodeID <= self.instancesIndex, "CollectReward: not a valid Node ID");

            self._collectNodeRewards(nodeID);
        }
    }

    receive(msg: Ncoin) {
        require(sender() == self.consensus, "ncoin: not authorized");

        self.ncoin = msg.nCoin;
    }

    fun getNodeStateInit(uid: String, nodeOwner: Address): StateInit {
        return initOf TonNode(uid, myAddress(), nodeOwner, now());
    }

    fun _collectNodeRewards(nodeID: Int) {
        let node: NodeInstance = self.instances.get(nodeID)!!;
        require (sender() == node.Owner, "_collectNodeRewards: not the owner of the Node");

        send(SendParameters{
            to: node.Address,
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors,
            body: Collect{
                ncoin: self.ncoin
            }.toCell()
        });

    }

    fun _instancesPerUser(user: Address): map<Int, NodeInstance> {
        let instancesArray: map<Int, NodeInstance> = emptyMap();

       foreach (key, value in self.instancesPerAddres) {
           if (key == user) {
                instancesArray.set(value, self.instances.get(value));
           }
       }

       return instancesArray;
    }

    get fun instanceInfoPerIndex(index: Int): NodeInstance? {
        return self.instances.get(index)
    }

    get fun instancesIndex(): Int {
        return self.instancesIndex;
    }

    get fun instancesPerUser(user: Address): map<Int, NodeInstance> {
       return self._instancesPerUser(user);
    }

    get fun owner(): Address {
       return self.owner;
    }

    get fun deployCost(): Int {
        return self.deployCost;
    }

    get fun balance(): Int {
      //  require(sender() == self.owner, "getBalance: not authorized");
        let currentBalance: Int = myBalance();
        return currentBalance;
    }
}
