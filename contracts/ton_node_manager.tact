import "@stdlib/deploy";
import "@stdlib/ownable";
import "./ton_node";
import "./owned_nodes_array.tact";

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

message CreateNode {
    instanceInt: Int;
}

const zeroAddress: Address = newAddress(0, 0x0000000000000000000000000000000000000000000000000000000000000000);

contract TonNodeFarm with Deployable, Ownable {
    owner: Address; // TonNodeAdmin
    farm_owner: Address;
    nodeArrayAddress: Address;

    init(ton_node_admin: Address, farm_owner: Address) {
        self.owner = ton_node_admin;
        self.farm_owner = farm_owner;
        self.nodeArrayAddress = zeroAddress;

    }

    receive(msg: CreateNode) {
        self.requireOwner();

        let init: StateInit = initOf TonNode(sender(), msg.instanceInt);
        let newNodeAddress: Address = contractAddress(init);

        send(SendParameters{
            to: newNodeAddress,
            value: ton("0.1"),
            mode: SendIgnoreErrors,
            body: "sayHi".asComment(),
            code: init.code,
            data: init.data
        });

        let arrayInit: StateInit = initOf OwnedNodesArray(myAddress());
        let arrayAddress: Address = contractAddress(arrayInit);
        self.nodeArrayAddress = arrayAddress;

        send(SendParameters{
            to: arrayAddress,
            value: ton("0.1"),
            mode: SendIgnoreErrors,
            body: Append{ID: msg.instanceInt}.toCell(),
            code: arrayInit.code,
            data: arrayInit.data,
        });
    }

    receive(msg: RefillNode) {
        self.requireOwner();
        let nodeAddress: Address = contractAddress(initOf TonNode(self.owner, msg.nodeInstance));

        send(SendParameters{
            to: nodeAddress,
            value: 0,
            bounce: false,
            mode: SendRemainingValue,
            body: "refill".asComment()
        });
    }
}

contract TonNodeAdmin with Deployable, Ownable {
    owner: Address; // The DAO address
    consensus: Address;
    ncoin: Address;
    balance: Int as uint64 = 0;
    deployCost: Int as coins = ton("1");
    nodesIndex: Int = 0;
    nodesLimit: Int as uint16 = 100;

    init(dao: Address) {
        self.owner = dao;
        self.ncoin = zeroAddress;
        self.consensus = zeroAddress;
    }

   receive(msg: ChangeDeployCost) {
        self.requireOwner();
        require(msg.newCost >= ton("1"), "changeDeployCost: new amount too low");

        self.deployCost = msg.newCost;
   }

   receive(msg: ChangeConsensusAddress) {
        self.requireOwner();

        self.consensus = msg.newConsensus;

        send(SendParameters{
            to: msg.newConsensus,
            value: 0,
            bounce: false,
            mode: SendRemainingValue,
            body: "ncoin".asComment(),
        });
   }

   receive("DeployNode") {
        let ctx: Context = context();
        require(ctx.value >= self.deployCost + ton("0.4"), "deployNode: invalid amount of Toncoins");

        let currentInstance: Int = self.nodesIndex + 1;
        self.nodesIndex = currentInstance;

        let init: StateInit = self._getNodeFarmStateInit(sender());
        let newNodeFarmAddress: Address = contractAddress(init);

        send(SendParameters{
            to: newNodeFarmAddress,
            value: ton("0.45"),
            bounce: false,
            mode: SendIgnoreErrors,
            body: CreateNode{instanceInt: currentInstance}.toCell(),
            code: init.code,
            data: init.data
        });
   }

   receive(msg: RefillNode) {
        let ctx: Context = context();
        require(ctx.value >= self.deployCost + ton("0.023"),
            "refillNode: value sent not enough for a refill");
        self.requireValidNodeID(msg.nodeInstance);
        let ownerWallet: Address = contractAddress(initOf TonNodeFarm(myAddress(), sender()));

        send(SendParameters{
            to: ownerWallet,
            value: 0,
            bounce: false,
            mode: SendRemainingValue,
            body: msg.toCell(),
        });
   }

   receive(_: GetInstancesIndex) {
        self.requireOwner();

        self.reply(InstanceIndex{index: self.nodesIndex}.toCell());
   }

   receive(msg: GetInstanceInfo) {
        self.requireOwner();
        self.requireValidNodeID(msg.instanceIndex);

        let nodeAddress: Address = self._getNodeInstanceAddress(msg.instanceIndex);
        self.reply(InstanceAddy{instanceAddy: nodeAddress}.toCell());
   }

    // @note for the NodeManager owner to withdraw the collected TON
    receive(_: Withdraw) {
        self.requireOwner();
        send(SendParameters{
            to: sender(),
            bounce: true,
            value: myBalance() - context().value - ton("0.01"),
            mode: SendRemainingValue + SendIgnoreErrors
        });
    }

    // receive(msg: CollectReward) {
    //     if (msg.forAll == true) {
    //         let nodes: map<Int, NodeInstance> = self._instancesPerUser(sender());
    //
    //        foreach (key, _ in nodes) {
    //            self._collectNodeRewards(key);
    //        }
    //
    //     } else {
    //         require(msg.nodeID != null, "CollectReward: invalid NodeID");
    //         let nodeID: Int = msg.nodeID!!;
    //         require(nodeID <= self.nodesIndex, "CollectReward: not a valid Node ID");
    //
    //         self._collectNodeRewards(nodeID);
    //     }
    // }

    receive(msg: Ncoin) {
        self.requireOwner();

        self.ncoin = msg.nCoin;
    }

    
    // fun _collectNodeRewards(nodeID: Int) {
    //     let node: NodeInstance = self.instances.get(nodeID)!!;
    //     require (sender() == node.Owner, "_collectNodeRewards: not the owner of the Node");
    //
    //     send(SendParameters{
    //         to: node.Address,
    //         value: 0,
    //         mode: SendRemainingValue + SendIgnoreErrors,
    //         body: Collect{
    //             ncoin: self.ncoin
    //         }.toCell()
    //     });
    //
    // }

    get fun instanceInfoPerIndex(index: Int): Address {
        self.requireValidNodeID(index);
        return self._getNodeInstanceAddress(index);
    }

    get fun nodesIndex(): Int {
        return self.nodesIndex;
    }

    // get fun instancesPerUser(user: Address): map<Int, NodeInstance> {
       // return self._instancesPerUser(user);
    // }

    get fun deployCost(): Int {
        return self.deployCost;
    }

    get fun balance(): Int {
      //  require(sender() == self.owner, "getBalance: not authorized");
        let currentBalance: Int = myBalance();
        return currentBalance;
    }

    fun _getNodeFarmStateInit(owner: Address): StateInit {
        return initOf TonNodeFarm(myAddress(), owner);
    }

    fun _getNodeInstanceAddress(index: Int): Address {
        let init: StateInit = initOf TonNode(myAddress(), index);
        let nodeAddress: Address = contractAddress(init);

        return nodeAddress;
    }

    fun requireValidNodeID(ID: Int) {
        require(ID <= self.nodesIndex, "not a valid node ID");
    }
}
