#! /usr/bin/env node
const package = require("../package.json");
const nodeIP = package.nodeIP;      // retrieve ip address of relay node from package.json
const network = package.network;    // retrieve network type (mainnet or testnet) from package.json
const chalk = require("chalk");
const infoColor = chalk.green;
const resultColor = chalk.bgGreen;
const errorColor = chalk.bold.bgRed;
const yargs = require("yargs");
const fs = require('fs');
const util = require('util')
require("dotenv").config();



// import Solar and ARK SDK libraries
const Crypto = require("@solar-network/crypto");    // https://www.npmjs.com/package/@solar-network/crypto
const Client = require("@arkecosystem/client");     // https://www.npmjs.com/package/@arkecosystem/client
const Identities = Crypto.Identities;
const Managers = Crypto.Managers;
const Utils = Crypto.Utils;
const Transactions = Crypto.Transactions;
const Connection = Client.Connection;
const client = new Connection(nodeIP);

// import IPFS libraries
const isIPFS = require("is-ipfs");   // used for verifying valid IPFS hash
const IPFSclient = require("ipfs-http-client");     //works with version 56.0.3.  Importing breaks when using version 57.x.x

// import Pinata IPFS SDK
const pinataSDK = require("@pinata/sdk");       // https://github.com/PinataCloud/Pinata-SDK
const pinata = pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_API_KEY);

//console.log(infoColor("api_key", process.env.PINATA_API_KEY));
//console.log(infoColor("secret_api_key", process.env.PINATA_SECRET_API_KEY));

//console.log(resultColor("api_key %s"), process.env.PINATA_API_KEY);
//console.log(resultColor("secret_api_key %s"), process.env.PINATA_SECRET_API_KEY);

// import AWS / Filebase libraries
const AWS = require('aws-sdk');
const { request } = require("http");
const s3 = new AWS.S3({ endpoint: 'https://s3.filebase.com', signatureVersion: 'v4' });


async function connectRelay() {
    console.log(infoColor("Opening", network, "connection to relay:", nodeIP));

    Managers.configManager.setFromPreset(network);   //set the network (testnet or mainnet)
    try {
        const blockchain = await client.get("blockchain");
        Managers.configManager.setHeight(blockchain.body.data.block.height);
        return true

    } catch (err) {
        console.log(errorColor(err));
        console.log(errorColor("Cannot connect to relay node"));
        return false
    }
    // const blockchain = await client.get("blockchain").catch(handleError);
}

(async () => {

    // customize yargs 
    yargs.scriptName("solar-cli")   // without this then --help shows filename [command] instead of app name
        .demandCommand(1)           // require at least 1 command
        .strict()                   // show help menu when invalid command


    yargs.updateStrings({
        "Options:": chalk.green("Options:")
    })

    yargs.updateStrings({
        "Commands:": chalk.green("Commands:")
    })



    /* 
     Command: Get Status of Relay node
    */
    yargs.command({
        command: "relay",
        describe: "Get status of relay node used for accessing blockchain",
        async handler(argv) {
            console.log(infoColor("Retrieving relay node status"));

            if (await connectRelay()) {
                try {
                    const response = await client.api("node").status();
                    console.log(resultColor("%s"), response.body.data);
                } catch (err) {
                    console.log(errorColor(err));
                    console.log(errorColor("Cannot retrieve node status"))
                }
            } else {

            }
        }
    }
    )





    /* 
 Command: Sign message
    */
    yargs.command({
        command: "sign",
        describe: "Sign message using Schnorr algorithm",
        builder: {
            msg: {
                describe: "Message to be signed",
                demandOption: true,
                type: "string"
            },
            passphrase: {
                describe: "Your Private Passphrase(12 words)",
                demandOption: true,
                type: "string"
            },
        },
        handler(argv) {

            console.log(infoColor("Signing message"));
            const message = argv.msg;
            const passphrase = argv.passphrase;
            const keys = Identities.Keys.fromPassphrase(passphrase);
            const hash = Crypto.Crypto.HashAlgorithms.sha256(message);
            const signature = Crypto.Crypto.Hash.signSchnorrBip340(hash, keys);
            const publicKey = Identities.PublicKey.fromPassphrase(passphrase);
            const signed = {
                message,
                signature,
                publicKey
            };
            console.log(signed);
        }
    }
    )


    /* 
 Command: Verify message signature
    */
    yargs.command({
        command: "verify",
        describe: "Verify Signature using Schnorr algorithm",
        builder: {
            msg: {
                describe: "Message that was signed",
                demandOption: true,
                type: "string"
            },
            publicKey: {
                describe: "Public key of sender",
                demandOption: true,
                type: "string"
            },
            signature: {
                describe: "Message Signature",
                demandOption: true,
                type: "string"
            },
        },
        handler(argv) {
            console.log(infoColor("Verifying message"));
            const message = argv.msg;
            const publicKey = argv.publicKey;
            const signature = argv.signature;
            const hash = Crypto.Crypto.HashAlgorithms.sha256(message);
            const verify = Crypto.Crypto.Hash.verifySchnorrBip340(
                hash,
                signature,
                publicKey
            );

            if (verify) {
                console.log(resultColor("Signature is verified"));
            } else {
                console.log(errorColor("Signature is invalid"));
            }
        }
    }
    )


    /* 
    Command: Send IPFS transaction
    */
    yargs.command({
        command: "tx-ipfs",
        describe: "Send IPFS transaction with optional Memo message",
        builder: {
            hash: {
                describe: "IPFS Hash",
                demandOption: true,
                type: "string"
            },
            fee: {
                describe: "Transaction Fee",
                demandOption: true,
                type: "string"
            },
            passphrase: {
                describe: "Your Private Passphrase(12 words)",
                demandOption: true,
                type: "string"
            },
            memo: {
                describe: "Message to include with transaction(optional)",
                demandOption: false,
                type: "string"
            },

        },
        async handler(argv) {

            if (!(await connectRelay())) {
                return
            }
            const passphrase = argv.passphrase;
            const senderWalletAddress = Identities.Address.fromPassphrase(passphrase);
            const ipfsHash = argv.hash;

            // verify if Hash is valid
            if (!(isIPFS.cid(ipfsHash))) {
                console.log(errorColor("Not a valid IPFS hash"));
                return
            }

            // Step 1: Retrieve the nonce of the sender wallet and increment
            let senderNonce;
            try {
                const senderWallet = await client.api("wallets").get(senderWalletAddress);
                senderNonce = Utils.BigNumber.make(senderWallet.body.data.nonce).plus(1);
            } catch (err) {
                console.log(errorColor(err));
                console.log(errorColor("Cannot retrieve nonce"))
            }

            let transaction = {};

            // Step 2: Create and Sign the transaction
            if ('memo' in argv) {
                //console.log("Memo exists");
                transaction = Transactions.BuilderFactory.ipfs()
                    .nonce(senderNonce.toFixed())
                    .ipfsAsset(ipfsHash)
                    .fee(argv.fee)
                    .memo(argv.memo)
                    .sign(passphrase);
            } else {
                // console.log("Memo does not exist");
                transaction = Transactions.BuilderFactory.ipfs()
                    .nonce(senderNonce.toFixed())
                    .ipfsAsset(ipfsHash)
                    .fee(argv.fee)
                    .sign(passphrase);
            }

            // Step 3: Broadcast the transaction
            console.log(infoColor("Sending transaction..."));
            const broadcastResponse = await client.api("transactions").create({ transactions: [transaction.build().toJson()] });
            // console.log(JSON.stringify(broadcastResponse.body, null, 4))
            if (broadcastResponse.status == 200) {
                const accept = broadcastResponse.body.data.accept;
                if (!(accept.length === 0)) {
                    const txid = broadcastResponse.body.data.accept[0];
                    console.log(resultColor("Transaction ID: %s"), txid);
                } else {
                    var invalidID = broadcastResponse.body.data.invalid[0];
                    var errormessage = broadcastResponse.body.errors[invalidID].message;
                    console.log(errorColor("Error Message: %s"), errormessage);
                }
            } else {
                console.log(errorColor("Error sending. Status code: %s"), broadcastResponse.status);
            }
        }
    }
    )


    /* 
     Command: Test Pinata API Authentication
    */
    yargs.command({
        command: "pinataTestAuth",
        describe: "Test the API Authentication",
        async handler(argv) {
            console.log(infoColor("Testing Pinata API Authentication"));

            pinata.testAuthentication().then((result) => {
                //handle successful authentication here
                console.log(resultColor("%s"), result);
            }).catch((err) => {
                //handle error here
                console.log(errorColor("Authentication error: %s"), err);
            });
        }
    }
    )





    /* 
  Command: Upload file to Pinata IPFS
     */
  yargs.command({
    command: "upload_pinata",
    describe: "Upload file to Pinata IPFS",
    builder: {
        fileName: {
            describe: "File name",
            demandOption: true,
            type: "string"
        }
    },
    async handler(argv) {
        console.log(infoColor("Sending File to Pinata"));
        const fileName = argv.fileName;

        const readableStreamForFile = fs.createReadStream(fileName);
        const options = {
            pinataMetadata: {
                name: fileName,
                keyvalues: {
                    customKey: 'customValue',
                    customKey2: 'customValue2'
                }
            },
            pinataOptions: {
                cidVersion: 0,
                wrapWithDirectory: true
            }
        };
        pinata.pinFileToIPFS(readableStreamForFile, options).then((result) => {
            //handle results here
            console.log(resultColor('CID: ' + result.IpfsHash));
        }).catch((err) => {
            //handle error here
            console.log(err);
        });

    }
}
)



    /* 
 Command: Upload file to Filebase / IPFS
 https://docs.filebase.com/configurations/code-examples/how-to-utilize-filebase-with-nodejs
    */
    yargs.command({
        command: "upload_filebase_old",
        describe: "Upload file to Filebase / IPFS",
        builder: {
            bucketName: {
                describe: "Name of Filebase Bucket",
                demandOption: true,
                type: "string"
            },
            fileName: {
                describe: "File name",
                demandOption: true,
                type: "string"
            }
        },
        async handler(argv) {
            console.log(infoColor("Sending File to Filebase"));
            const bucketName = argv.bucketName;
            const fileName = argv.fileName;

            var params = {
                Body: fs.readFileSync(fileName),
                Bucket: bucketName,
                Key: fileName
                //  ContentType: 'text/plain'
            };
            s3.putObject(params, function (error, data) {
                if (error) {
                    console.error(error);
                } else {
                    console.log(resultColor('Successfully uploaded file' + fileName + " to bucket " + bucketName));
                }
            });
        }
    }
    )


    /* 
  Command: Upload file to Filebase / IPFS
  https://docs.filebase.com/ipfs/code-examples-pinning-files-and-folders/aws-sdk-for-javascript#4.-create-a-new-file-with-the-following-aws-sdk-for-javascript-code
     */
    yargs.command({
        command: "upload_filebase",
        describe: "Upload file to Filebase / IPFS",
        builder: {
            bucketName: {
                describe: "Name of Filebase Bucket",
                demandOption: true,
                type: "string"
            },
            fileName: {
                describe: "File name",
                demandOption: true,
                type: "string"
            }
        },
        async handler(argv) {
            console.log(infoColor("Sending File to Filebase"));
            const bucketName = argv.bucketName;
            const fileName = argv.fileName;

            fs.readFile(fileName, (err, data) => {
                if (err) {
                    console.error(err);
                    return;
                }
                const params = {
                    Body: data,
                    Bucket: bucketName,
                    Key: fileName,
                    Metadata: { firmware: "fdf" }
                    //  ContentType: 'text/plain'
                };

                const request = s3.putObject(params);
                request.on('httpHeaders', (statusCode, headers) => {
                    console.log(resultColor(`CID: ${headers['x-amz-meta-cid']}`));
                });
                request.send();
            });
        }
    }
    )



    process.on("uncaughtException", (err) => {
        console.log(errorColor("UncaughtException %s"), err);
    })


    yargs.parse()
})();
