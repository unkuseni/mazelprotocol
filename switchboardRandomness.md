# Randomness

Blockchain users want randomness for many applications like gaming, NFT mints, lotteries, and more. However, this poses a fundamental challenge to blockchains, which are deterministic computers replicated across many nodes across the globe. Each node needs to produce the exact same output when given the same sequence of inputs.

<figure><img src="https://3334377360-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FZtEdPUTo9BfQxhyIOSQO%2Fuploads%2Fgit-blob-e542732b28ddd45bccabe357ffe7941006ade3c6%2Frandomness-00.png?alt=media" alt=""><figcaption></figcaption></figure>

Imagine if an on-chain lottery was deciding whether to mint an NFT to Alice or Bob. If blockchain nodes ran their own randomness and some decided that the NFT would go to Alice, and others to Bob, there would be a state mismatch.

<figure><img src="https://3334377360-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FZtEdPUTo9BfQxhyIOSQO%2Fuploads%2Fgit-blob-54382c55aa1561120e16af7158294565ef922d71%2Frandomness-01.png?alt=media" alt=""><figcaption></figcaption></figure>

This is where oracles come in. An oracle can run the randomness off-chain and then post a single result to the blockchain, ensuring that all nodes agree on the result of the randomness.

<figure><img src="https://3334377360-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FZtEdPUTo9BfQxhyIOSQO%2Fuploads%2Fgit-blob-34b9f9abbdc96682bb94c8a8c6ed319c1051709b%2Frandomness-02.png?alt=media" alt=""><figcaption></figcaption></figure>

However, as a third-party source of randomness, it's critical to make sure that nefarious actors cannot control the oracle and bias the randomness in their favor.

<figure><img src="https://3334377360-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FZtEdPUTo9BfQxhyIOSQO%2Fuploads%2Fgit-blob-bb480f96a789f86739b01b6d9a73152f5c655338%2Frandomness-03.png?alt=media" alt=""><figcaption></figcaption></figure>

As an oracle provider, Switchboard's network serves as a trusted and verified third-party that can post fair random numbers to the blockchain.

<figure><img src="https://3334377360-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FZtEdPUTo9BfQxhyIOSQO%2Fuploads%2Fgit-blob-5306e5e372be2fe9f4ac94a709ea7e6618048bae%2Frandomness-04.png?alt=media" alt=""><figcaption></figcaption></figure>

## Switchboard’s approach

Switchboard leverages Trusted Execution Environments (TEEs), which are protected areas inside of a computer's processing unit that cannot be altered or inspected. This means:

* No one, including the oracle operator, can alter the code that’s running on the TEEs
* No one, including the oracle operator, can see what’s going on inside the chip, only inputs and outputs.

This means that Switchboard oracles can generate safe and fair randomness that is free from malicious influence. As an extra layer of protection, Switchboard network incentives ensure that oracle oeprators that misbehave by experiencing downtime or withholding results can have their $SWTCH stake slashed.

## How to Use Switchboard Randomness

To understand the flow, it's helpful to visualize the following 5 parties.

* **Alice**: blockchain user
* **App**: on-chain application
* **Switchboard Contract**: on-chain contract that handles anything Switchboard-related.
* **Crossbar**: server that helps you talk to oracles
* **Oracle**: generates randomness

<figure><img src="https://3334377360-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FZtEdPUTo9BfQxhyIOSQO%2Fuploads%2Fgit-blob-bf238dee0832530c832a549ecba35de68e63e08b%2Frandomness-05.png?alt=media" alt=""><figcaption></figcaption></figure>

There are two stages, requesting and resolving the randomness.

### Request Randomness

* First, **Alice** talks to the **App** requesting some random event.
* The **App** then generates a randomness request with a unique ID and sends it to the **Switchboard contract**.
* The **Switchboard contract** responds to the **App** with an oracle assignment.
* The **App** responds to **Alice** with the oracle assignment and randomness ID.

### Resolve Randomness

* **Alice** sends the oracle assignment, randomness ID, and some other data to **Crossbar** to get the randomness.
* **Crossbar** asks the **Oracle** to generate randomness.
* The **Oracle** creates a randomness object and sends it to **Crossbar** which passes it back to **Alice**.
* **Alice** sends the randomness object to the **App**.
* The **App** asks the **Switchboard contract** to verify that the randomness it received from Alice is correct.
* If all is well, the **Switchboard contract** sends verification to the **App**, resolving the random event.

\--
