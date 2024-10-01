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

message CreateNode {
    instanceInt: Int;
}

contract TonNodeFarm with Deployable, Ownable {
    owner: Address; // TonNodeAdmin
    ncoin: Address;
    farm_owner: Address; // Actual user
    nodeArrayAddress: Address;

    init(ton_node_admin: Address, ncoin: Address, farm_owner: Address) {
        self.owner = ton_node_admin;
        self.ncoin = ncoin;
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

        if (self.nodeArrayAddress == zeroAddress) {
            self.nodeArrayAddress = arrayAddress;
        }

        send(SendParameters{
            to: arrayAddress,
            value: ton("0.1"),
            mode: SendIgnoreErrors,
            body: Append{ID: msg.instanceInt}.toCell(),
            code: arrayInit.code,
            data: arrayInit.data,
        });
    }

    receive(msg: CollectReward) {
        if (msg.forAll == true) {
            send(SendParameters{
                to: self.nodeArrayAddress,
                value: 0,
                bounce: false,
                mode: SendRemainingValue,
                body: "owned_instances_ids".asComment(),
            });
        } else {
            self._collectNodeRewards(msg.nodeID!!);
        }
    }

    receive(msg: OwnedInstances) {
        require(sender() == self.nodeArrayAddress, "OwnedInstances: not authorized");

        if (msg.instances.length > 0) {
            foreach (key, value in msg.instances.m) {
                self._collectNodeRewards(value);
            }
        }
    }

    receive(msg: RefillNode) {
        self.requireOwner();
        let nodeAddress: Address = contractAddress(initOf TonNode(
            self.owner, msg.nodeInstance
        ));

        send(SendParameters{
            to: nodeAddress,
            value: 0,
            bounce: false,
            mode: SendRemainingValue,
            body: "refill".asComment()
        });
    }

    fun _collectNodeRewards(nodeID: Int) {
        let nodeAddress: Address = contractAddress(initOf TonNode(
            self.owner, nodeID
        ));

        send(SendParameters{
            to: nodeAddress,
            value: ton("0.05"),
            bounce: false,
            mode: 0,
            body: Collect{
                ncoin: self.ncoin,
                farm_owner: self.farm_owner
            }.toCell()
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

    init(dao: Address, ncoin: Address) {
        self.owner = dao;
        self.ncoin = ncoin;
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
        let ownerWallet: Address = contractAddress(initOf TonNodeFarm(myAddress(), self.ncoin, sender()));

        send(SendParameters{
            to: ownerWallet,
            value: 0,
            bounce: false,
            mode: SendRemainingValue,
            body: msg.toCell(),
        });
   }

   receive("GetInstancesIndex") {
        self.requireConsensus();
        self.reply(InstanceIndex{index: self.nodesIndex}.toCell());
   }

   receive(msg: GetInstanceInfo) {
        self.requireConsensus();
        self.requireValidNodeID(msg.instanceIndex);

        let nodeAddress: Address = contractAddress(initOf TonNode(
            myAddress(), msg.instanceIndex
        ));
        self.reply(InstanceAddy{instanceAddy: nodeAddress}.toCell());
   }

    // @note for the NodeManager owner to withdraw the collected TON
    receive("Withdraw") {
        self.requireOwner();
        send(SendParameters{
            to: sender(),
            bounce: true,
            value: myBalance() - context().value - ton("0.01"),
            mode: SendRemainingValue + SendIgnoreErrors
        });
    }

   receive(msg: CollectReward) {
        let ownerWallet: Address = contractAddress(initOf TonNodeFarm(myAddress(), self.ncoin, sender()));

        send(SendParameters{
            to: ownerWallet,
            value: 0,
            bounce: false,
            mode: SendRemainingValue,
            body: msg.toCell(),
        });
   }

   
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
       return initOf TonNodeFarm(myAddress(), self.ncoin, owner);
   }

   fun _getNodeInstanceAddress(index: Int): Address {
       let init: StateInit = initOf TonNode(myAddress(), index);
       let nodeAddress: Address = contractAddress(init);

       return nodeAddress;
   }

   fun requireValidNodeID(ID: Int) {
       require(ID <= self.nodesIndex, "not a valid node ID");
   }

   fun requireConsensus() {
       require(sender() == self.consensus, "not allowed, only for consensus use");
   }
}
