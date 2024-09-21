import "@stdlib/deploy";
import "./ncoin.tact";

struct Params {
    nodeUID: String;
    nodeOwner: Address;
}

message Collect {
    ncoin: Address;
}

message NodeInit {
    body: Params;
}

message Refill {
    amountOfDays: Int;
}

struct NodeState {
    nodeManager: Address;
    nodeUID: String;
    nodeOwner: Address;
    nodeStartTime: Int as uint64;  // unix timestamp
    nodeEndTime: Int as uint64;    // in seconds
}

message GetIsNodeActiveStatus {
}

message NodeActiveStatus {
    isActive: Bool;
}

contract TonNode with Deployable {
    nodeManager: Address;
    nodeUID: String;
    nodeOwner: Address;
    nodeStartTime: Int as uint32;  // unix timestamp
    nodeEndTime: Int as uint32;    // in seconds

    init(uid: String, deployer: Address, owner: Address, startTime: Int) {
        self.nodeUID = uid;
        self.nodeManager = deployer;
        self.nodeOwner = owner;
        self.nodeStartTime = startTime;
        self.nodeEndTime = 86400; // 24 hours in seconds
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
                destination: self.nodeOwner,
                response_destination: self.nodeOwner,
                custom_payload: emptyCell(),
                forward_ton_amount: 0,
                forward_payload: beginCell().endCell().asSlice(),
            }.toCell(),
        });
    }

    receive(msg: Collect) {
        let wallet: Address = contractAddress(initOf NodeCoinWallet(myAddress(), msg.ncoin));
        send(SendParameters{
            to: wallet,
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors,
            body: "balance".asComment(),
        });
    }

    receive(_: GetIsNodeActiveStatus) {
        self.reply(NodeActiveStatus{
            isActive: (self.nodeStartTime + self.nodeEndTime) > now()
        }.toCell());
    }

    receive(_: Refill) {
        require(sender() == self.nodeManager, "refill: not authorized");
        let currentTime: Int = now();
        require(currentTime >= self.nodeStartTime + 26600,
            "refill: must refill at least 12 hours before the node closes");

        let remainingTime: Int = (self.nodeStartTime + self.nodeEndTime) - currentTime <= 0
            ? 0 : (self.nodeStartTime + self.nodeEndTime) - currentTime;

        self.nodeStartTime = currentTime;
        self.nodeEndTime = remainingTime + 86400;

        self.reply("Done!".asComment());
    }

   get fun instanceInfo(): NodeState {
        return NodeState {
            nodeManager: self.nodeManager,
            nodeUID: self.nodeUID,
            nodeOwner: self.nodeOwner,
            nodeStartTime: self.nodeStartTime,
            nodeEndTime: self.nodeEndTime,
        };
    }
}
