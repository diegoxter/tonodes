import "@stdlib/deploy";
import "./imports/jetton_master";
import "./imports/jetton_wallet";

message GetNodeConsensusWallet {
}

message NodeConsensusWallet {
    jettonWallet: Address;
}

message AddNewMinter {
    new_minter_address: Address;
}

message RemoveMinter {
    minter: Address;
}

message MintAmountTo {
    to: Address;
    amount: Int as coins;
}

message CallerBalance {
    ncoin: Address;
    balance: Int;
}

contract NodeCoinWallet with JettonWallet {
    balance: Int as coins = 0;
    owner: Address;

    jetton_master: Address;

    init(owner: Address, jetton_master: Address) {
        self.owner = owner;
        self.jetton_master = jetton_master;
    }

    receive("balance") {
        self.reply(CallerBalance{balance: self.balance, ncoin: self.jetton_master}.toCell());
    }

    override inline fun calculate_jetton_wallet_init(owner_address: Address): StateInit {
        return initOf NodeCoinWallet(owner_address, self.jetton_master);
    }
}

contract NodeCoin with JettonMaster, Deployable {
    total_supply: Int as coins;
    mintable: Bool;
    owner: Address;
    minters: map<Address, Bool>;
    jetton_content: Cell;
    max_supply: Int as coins;

    init(owner: Address, content: Cell, max_supply: Int) {
        self.total_supply = 0;
        self.mintable = true;
        self.owner = owner;
        self.jetton_content = content;
        self.minters = emptyMap();
        self.max_supply = max_supply;
    }

    receive(msg: MintAmountTo) {
        let ctx: Context = context();
        let new_msg: JettonMint = JettonMint{
            origin: ctx.sender,
            receiver: msg.to,
            amount: msg.amount,
            custom_payload: emptyCell(),
            forward_ton_amount: 0,
            forward_payload: emptySlice()
        };
        self._mint_validate(ctx, new_msg);
        self._mint(ctx, new_msg);
    }

    receive("Mint: 100") {
        let ctx: Context = context();
        let msg: JettonMint = JettonMint{
            origin: ctx.sender,
            receiver: ctx.sender,
            amount: ton("100"),
            custom_payload: emptyCell(),
            forward_ton_amount: 0,
            forward_payload: emptySlice()
        };
        self._mint_validate(ctx, msg);
        self._mint(ctx, msg);
    }

    receive("Toggle pause") {
        require(sender() == self.owner, "Pause: not authorized");
        self.mintable = !self.mintable;
    }

    receive(_: GetNodeConsensusWallet) {
        self.reply(NodeConsensusWallet{
            jettonWallet: self._get_wallet_address(sender())
        }.toCell());
    }

    receive(msg: AddNewMinter) {
        self.add_new_minter(msg.new_minter_address);
    }

    receive(msg: RemoveMinter) {
        self.remove_minter(msg.minter);
    }

    fun add_new_minter(new_minter_address: Address) {
        require(sender() == self.owner, "add_new_minter: unauthorized");

        self.minters.set(new_minter_address, true);
    }

    fun remove_minter(minter_address: Address) {
        require(sender() == self.owner, "remove_minter: unauthorized");

        self.minters.set(minter_address, false);
    }

    override inline fun _mint_validate(ctx: Context, msg: JettonMint) {
        require(ctx.sender == self.owner || self.minters.get(ctx.sender) == true, "JettonMaster: Sender is not a Jetton owner not a minter");
        require(self.mintable, "JettonMaster: Jetton is not mintable");
        require(self.total_supply + msg.amount <= self.max_supply, "_mint: amount exceeds max_supply");
    }

    override inline fun calculate_jetton_wallet_init(owner_address: Address): StateInit {
        return initOf NodeCoinWallet(owner_address, myAddress());
    }
  } 
