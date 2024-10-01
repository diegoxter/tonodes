import "@stdlib/deploy";
import "@stdlib/ownable";
import "./imports/arrays.tact";

message Append {
    ID: Int;
}

message Delete {
    index: Int;
}

message OwnedInstances {
    instances: Array;
}

contract OwnedNodesArray with Deployable, Ownable {
    array: Array;
    owner: Address;

    init(owner: Address) {
        require(sender() == owner, "init: deployer is not the owner");
        self.array = emptyArray();
        self.owner = owner;
    }

    receive(msg: Append) {
        self.requireOwner();
        self.array.append(msg.ID);

        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors
        });
    }

    receive("owned_instances_ids") {
       self.reply(OwnedInstances{instances: self.array}.toCell());
    }

    receive(msg: Delete) {
        self.requireOwner();
        self.reply(self.array.deleteIdx(msg.index).toCoinsString().asComment());
    }

    get fun instancesPerUser(): Array {
        return self.array;
    }

    get fun findItemIndexByID(ID: Int): Int? {
        return self._findItemArrayIndexByID(ID);
    }

    fun _findItemArrayIndexByID(ID: Int): Int? {
        let index: Int? = null;


        foreach (key, value in self.array.m) {
           if (value == ID) {
                index = key;
           }
        }

        return index;
    }
}
