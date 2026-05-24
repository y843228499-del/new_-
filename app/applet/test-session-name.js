const { OPCUAClient, MessageSecurityMode, SecurityPolicy } = require("node-opcua");

async function test() {
    const client1 = OPCUAClient.create({
        endpointMustExist: false,
        clientName: "AppTestClient-Sess1",
        connectionStrategy: { maxRetry: 0 }
    });
    console.log("Client 1 Name:", client1.clientName);
    
    // We can't connect easily without a real server, but let's check
    // if clientName is set on the object.
}
test();
