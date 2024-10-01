import "@stdlib/deploy";
import "@stdlib/ownable";
import "./ncoin.tact";

message Collect {
    ncoin: Address;
    farm_owner: Address;
}

struct NodeState {
    owner: Address;
    nodeID: Int;
    nodeStartTime: Int as uint64;  // unix timestamp
    nodeEndTime: Int as uint64;    // in seconds
}

message NodeActiveStatus {
    isActive: Bool;
}

const zeroAddress: Address = newAddress(0, 0x0000000000000000000000000000000000000000000000000000000000000000);


contract TonNode with Deployable, Ownable, OwnableTransferable {
    nodeID: Int;
    ton_node_admin: Address;
    owner: Address; // NodeFarm
    farm_owner: Address; // Actual user
    nodeStartTime: Int as uint32;  // unix timestamp
    nodeEndTime: Int as uint32;    // in seconds

    init(tna: Address, ID: Int) {
        self.nodeID = ID;
        self.ton_node_admin = tna;
        self.farm_owner = zeroAddress;
        self.owner = sender(); // NodeFarm
        self.nodeEndTime = 86400; // 24 hours in seconds

        let startTime = now();
        self.nodeStartTime = startTime;
    }

    receive(msg: CallerBalance) {
        let wallet: Address = contractAddress(initOf NodeCoinWallet(myAddress(), msg.ncoin));
        require(sender() == wallet, "Balance: not authorized");
        require(msg.balance > 0, "Balance: no rewards to collect");

        send(SendParameters{
            to: wallet,
            value: 0,
            mode: SendRemainingValue | SendPayGasSeparately | SendBounceIfActionFail,
            body: JettonTransfer{
                query_id: 0,
                amount: msg.balance,
                destination: self.farm_owner,
                response_destination: self.farm_owner,
                custom_payload: emptyCell(),
                forward_ton_amount: 0,
                forward_payload: beginCell().endCell().asSlice(),
            }.toCell(),
        });
    }

    receive(msg: Collect) {
        self.requireOwner();
        self.farm_owner = msg.farm_owner;

        let wallet: Address = contractAddress(initOf NodeCoinWallet(myAddress(), msg.ncoin));
        send(SendParameters{
            to: wallet,
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors,
            body: "balance".asComment(),
        });
    }

    receive("GetIsNodeActiveStatus") {
        self.reply(NodeActiveStatus{
            isActive: (self.nodeStartTime + self.nodeEndTime) > now()
        }.toCell());
    }

    receive("refill") {
        self.requireOwner();
        let currentTime: Int = now();
        require(currentTime >= self.nodeStartTime + 26600,
            "refill: must refill at least 12 hours before the node closes");

        let remainingTime: Int = (self.nodeStartTime + self.nodeEndTime) - currentTime <= 0
            ? 0 : (self.nodeStartTime + self.nodeEndTime) - currentTime;

        self.nodeStartTime = currentTime;
        self.nodeEndTime = remainingTime + 86400;

        self.reply("Done!".asComment());
    }

    receive("sayHi") {
        emit("hi!".asComment());
    }

    // receive(msg: Transfer) {
    //
    // }

   get fun instanceInfo(): NodeState {
        return NodeState {
            owner: self.owner,
            nodeID: self.nodeID,
            nodeStartTime: self.nodeStartTime,
            nodeEndTime: self.nodeEndTime,
        };
    }
}
