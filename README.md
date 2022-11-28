# CLI utility for uploading files to Pinata or Filebase.  After uploading files to IPFS, the CID can be recorded on the Solar blockchain using the unique IPFS transaction type.

## Installation
`npm install -g`

In package.json file configure the ip address of your Solar relay node via **nodeIP** parameter. 

In package.json file configure the network(testnet or mainnet) via **network** parameter.

copy the .env.sample file to .env and update with your own Pinata and/or Filebase credentials

## Using the CLI
To get list of commands: `solar-ipfs --help`

To get help on each command: `solar-ipfs <command> --help`

### Commands
* **solar-ipfs relay**   Get status of relay node used for accessing blockchain
* **solar-ipfs peers**   Get list of peers
* **solar-ipfs sign**   Sign message using Schnorr algorithm
* **solar-ipfs verify**   Verify Signature using Schnorr algorithm
* **solar-ipfs tx-ipfs**   Send IPFS transaction with optional memo message
* **solar-ipfs upload_pinata**   Upload file to IPFS Pinata account
* **solar-ipfs upload_filebase**   Upload file to IPFS bucket on Filebase account


### **solar-ipfs relay**
**Description:** Get status of relay node used for accessing blockchain  
**Options:** none  

###  **solar-ipfs sign**
**Description**: Sign message using bip340 Schnorr algorithm  
**Options:**  
  --msg  Message to be signed  
  --passphrase  Your Private Passphrase(12 words)  

###  **solar-ipfs verify**
**Description:** Verify Signature using bip340 Schnorr algorithm  
**Options:**  
  --msg  Message to be signed  
  --publicKey   Public key of sender  
  --signature   Message signature  

###  **solar-ipfs tx-ipfs**
**Description:** Send IFPS transaction with optional memo message  
**Options:**  
  --hash  IPFS Hash  
  --fee  Transaction fee amount  
  --passphrase  Your Private Passphrase(12 words)  
  --memo  file name that contains optional memo text 
  
###  **solar-ipfs upload_pinata**
**Description:** Upload file to IPFS Pinata account  
**Options:**  
  --filename  file name to upload

###  **solar-ipfs upload_filebase**
**Description:** Upload file to IPFS Filebase account  
**Options:**  
  --filename  file name to upload
  --bucketName previously created bucket name
