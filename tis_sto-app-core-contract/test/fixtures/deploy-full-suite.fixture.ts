// import { BigNumber, Contract, Signer } from 'ethers';
import "@nomiclabs/hardhat-ethers";
import { ethers, upgrades } from "hardhat";
import OnchainID from '@onchain-id/solidity';
// import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

// export async function deployIdentityProxy(implementationAuthority: Contract['address'], managementKey: string, signer: Signer) {
//     const identity = await new ethers.ContractFactory(
//             OnchainID.contracts.IdentityProxy.abi, OnchainID.contracts.IdentityProxy.bytecode, signer).deploy(
//                     implementationAuthority, managementKey);
//     return ethers.getContractAt('Identity', identity.address, signer);
// }

// TREXGateway配下の各Registry,Factory,生成/管理対象コントラクトをデプロイ/セットアップ
export async function deployFullSuiteFixture() {
    const [deployer, tokenIssuer, tokenAgent, tokenAdmin, claimIssuer,
            aliceWallet, bobWallet, charlieWallet, davidWallet, anotherWallet] = await ethers.getSigners();
    const claimIssuerSigningKey = ethers.Wallet.createRandom();
    const aliceActionKey = ethers.Wallet.createRandom();

    // 実コントラクトのデプロイ
    const claimTopicsRegistryImplementation = await ethers.deployContract('ClaimTopicsRegistry', deployer);
    const trustedIssuersRegistryImplementation = await ethers.deployContract('TrustedIssuersRegistry', deployer);
    const identityRegistryStorageImplementation = await ethers.deployContract('IdentityRegistryStorage', deployer);
    const identityRegistryImplementation = await ethers.deployContract('IdentityRegistry', deployer);
    const modularComplianceImplementation = await ethers.deployContract('ModularCompliance', deployer);
    const tokenImplementation = await ethers.deployContract('STLinkToken', deployer);
    const identityImplementation = await new ethers.ContractFactory(
        OnchainID.contracts.Identity.abi,
        OnchainID.contracts.Identity.bytecode,
        deployer,
    ).deploy(deployer.address, true);

    const identityImplementationAuthority = await new ethers.ContractFactory(
        OnchainID.contracts.ImplementationAuthority.abi,
        OnchainID.contracts.ImplementationAuthority.bytecode,
        deployer,
    ).deploy(identityImplementation.address);

    const identityFactory = await new ethers.ContractFactory(OnchainID.contracts.Factory.abi, OnchainID.contracts.Factory.bytecode, deployer).deploy(
        identityImplementationAuthority.address,
    );

    const trexImplementationAuthority = await ethers.deployContract(
        'TREXImplementationAuthority',
        [true, ethers.constants.AddressZero, ethers.constants.AddressZero],
        deployer,
    );
    const versionStruct = { // 現TokenySolutions/T-REXのバージョン
        major: 4,
        minor: 1,
        patch: 3,
    };
    const contractsStruct = {
        tokenImplementation: tokenImplementation.address,
        ctrImplementation: claimTopicsRegistryImplementation.address,
        irImplementation: identityRegistryImplementation.address,
        irsImplementation: identityRegistryStorageImplementation.address,
        tirImplementation: trustedIssuersRegistryImplementation.address,
        mcImplementation: modularComplianceImplementation.address,
    };
    await trexImplementationAuthority.connect(deployer).addAndUseTREXVersion(versionStruct, contractsStruct);

    const trexFactory = await ethers.deployContract('STLinkTREXFactory', [trexImplementationAuthority.address, identityFactory.address], deployer);
    await identityFactory.connect(deployer).addTokenFactory(trexFactory.address);
    const stoRegistry = await ethers.deployContract('StoRegistry', deployer);
    await stoRegistry.connect(deployer).initialize();
    const tokenHolderFactory = await ethers.deployContract('TokenHolderFactory', deployer);
    await tokenHolderFactory.connect(deployer).initialize();
    
    const trexGatewayContract = await ethers.deployContract('STLinkTREXGateway',
        [trexFactory.address, stoRegistry.address, tokenHolderFactory.address, true], deployer);
    await trexFactory.transferOwnership(trexGatewayContract.address);
//  【注意】「StRelease.sol」をデプロイした後に要実行
//  await trexGatewayContract.connect(deployer).addDeployer(stRelease.address);


    // const claimTopicsRegistry = await ethers
    //     .deployContract('ClaimTopicsRegistryProxy', [trexImplementationAuthority.address], deployer)
    //     .then(async (proxy) => ethers.getContractAt('ClaimTopicsRegistry', proxy.address));

    // const trustedIssuersRegistry = await ethers
    //     .deployContract('TrustedIssuersRegistryProxy', [trexImplementationAuthority.address], deployer)
    //     .then(async (proxy) => ethers.getContractAt('TrustedIssuersRegistry', proxy.address));

    // const identityRegistryStorage = await ethers
    //     .deployContract('IdentityRegistryStorageProxy', [trexImplementationAuthority.address], deployer)
    //     .then(async (proxy) => ethers.getContractAt('IdentityRegistryStorage', proxy.address));

    // const defaultCompliance = await ethers.deployContract('DefaultCompliance', deployer);

    // const identityRegistry = await ethers.deployContract(
    //         'IdentityRegistryProxy',
    //         [trexImplementationAuthority.address, trustedIssuersRegistry.address, claimTopicsRegistry.address, identityRegistryStorage.address],
    //         deployer,
    //     ).then(async (proxy) => ethers.getContractAt('IdentityRegistry', proxy.address));

    // const tokenOnchainID = await deployIdentityProxy(identityImplementationAuthority.address, tokenIssuer.address, deployer);
    // const tokenName = 'TREXDINO';
    // const tokenSymbol = 'TREX';
    // const tokenDecimals = BigNumber.from('0');
    // const token = await ethers
    //     .deployContract(
    //         'TokenProxy',
    //         [
    //             trexImplementationAuthority.address,
    //             identityRegistry.address,
    //             defaultCompliance.address,
    //             tokenName,
    //             tokenSymbol,
    //             tokenDecimals,
    //             tokenOnchainID.address,
    //         ],
    //         deployer,
    //     )
    //     .then(async (proxy) => ethers.getContractAt('STLinkToken', proxy.address));

    // const agentManager = await ethers.deployContract('AgentManager', [token.address], tokenAgent);

    // await identityRegistryStorage.connect(deployer).bindIdentityRegistry(identityRegistry.address);

    // await token.connect(deployer).addAgent(tokenAgent.address);
    // await token.connect(deployer).addAgent(tokenIssuer.address);
    // await token.connect(tokenIssuer).unpause();

    // const claimTopics = [ethers.utils.id('CLAIM_TOPIC')];
    // await claimTopicsRegistry.connect(deployer).addClaimTopic(claimTopics[0]);

    // const claimIssuerContract = await ethers.deployContract('ClaimIssuer', [claimIssuer.address], claimIssuer);
    // await claimIssuerContract.connect(claimIssuer)
    //   .addKey(ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [claimIssuerSigningKey.address])), 3, 1);

    // await trustedIssuersRegistry.connect(deployer).addTrustedIssuer(claimIssuerContract.address, claimTopics);

    // // テスト用トークン保有者（Alice, Bob, Charlie）のIdentityコントラクト（Proxy）をデプロイ/セットアップ
    // const aliceIdentity = await deployIdentityProxy(identityImplementationAuthority.address, aliceWallet.address, deployer);
    // await aliceIdentity.connect(aliceWallet).addKey( // aliceActionKeyにもIdentityコントラクトのアクションを実行する権限を付加
    //     ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['address'], [aliceActionKey.address])),
    //     2,  // ERC734：（1: MANAGEMENT、2: ACTION、3: CLAIM、4: ENCRYPTION）
    //     1); // ERC734：（1: ECDSA、2: RSA、3: 他の暗号方式）※ECDSA（Ethereum標準の署名方式）
    // const bobIdentity = await deployIdentityProxy(identityImplementationAuthority.address, bobWallet.address, deployer);
    // const charlieIdentity = await deployIdentityProxy(identityImplementationAuthority.address, charlieWallet.address, deployer);
    // const tokenIssuerIdentity = await deployIdentityProxy(identityImplementationAuthority.address, tokenIssuer.address, deployer);

    // await identityRegistry.connect(deployer).addAgent(tokenAgent.address);
    // await identityRegistry.connect(deployer).addAgent(token.address);

    // await identityRegistry.connect(tokenAgent)
    //     .batchRegisterIdentity(
    //         [aliceWallet.address, bobWallet.address, tokenIssuer.address],
    //         [aliceIdentity.address, bobIdentity.address, tokenIssuerIdentity.address],
    //         [42, 666, 777]); // 国コード（使用しないため任意の値）

    // const claimForAlice = {
    //     data: ethers.utils.hexlify(ethers.utils.toUtf8Bytes('Some claim public data.')),
    //     issuer: claimIssuerContract.address,
    //     topic: claimTopics[0],
    //     scheme: 1,
    //     identity: aliceIdentity.address,
    //     signature: '',
    // };
    // claimForAlice.signature = await claimIssuerSigningKey.signMessage(
    //     ethers.utils.arrayify(
    //         ethers.utils.keccak256(
    //             ethers.utils.defaultAbiCoder.encode(
    //                 ['address', 'uint256', 'bytes'],
    //                 [claimForAlice.identity, claimForAlice.topic, claimForAlice.data]),
    //         ),
    //     ),
    // );
    // await aliceIdentity.connect(aliceWallet)
    //     .addClaim(claimForAlice.topic, claimForAlice.scheme, claimForAlice.issuer, claimForAlice.signature, claimForAlice.data, '');

    // const claimForBob = {
    //     data: ethers.utils.hexlify(ethers.utils.toUtf8Bytes('Some claim public data.')),
    //     issuer: claimIssuerContract.address,
    //     topic: claimTopics[0],
    //     scheme: 1,
    //     identity: bobIdentity.address,
    //     signature: '',
    // };
    // claimForBob.signature = await claimIssuerSigningKey.signMessage(
    //     ethers.utils.arrayify(
    //         ethers.utils.keccak256(
    //             ethers.utils.defaultAbiCoder.encode(
    //                 ['address', 'uint256', 'bytes'],
    //                 [claimForBob.identity, claimForBob.topic, claimForBob.data]),
    //         ),
    //     ),
    // );
    // await bobIdentity.connect(bobWallet)
    //     .addClaim(claimForBob.topic, claimForBob.scheme, claimForBob.issuer, claimForBob.signature, claimForBob.data, '');

    // const claimForTokenIssuer = {
    //     data: ethers.utils.hexlify(ethers.utils.toUtf8Bytes('Some claim public data.')),
    //     issuer: claimIssuerContract.address,
    //     topic: claimTopics[0],
    //     scheme: 1,
    //     identity: tokenIssuerIdentity.address,
    //     signature: '',
    // };
    // claimForTokenIssuer.signature = await claimIssuerSigningKey.signMessage(
    //     ethers.utils.arrayify(
    //         ethers.utils.keccak256(
    //             ethers.utils.defaultAbiCoder.encode(
    //                 ['address', 'uint256', 'bytes'],
    //                 [claimForTokenIssuer.identity, claimForTokenIssuer.topic, claimForTokenIssuer.data]),
    //         ),
    //     ),
    // );
    // await tokenIssuerIdentity.connect(tokenIssuer).addClaim(claimForTokenIssuer.topic,
    //     claimForTokenIssuer.scheme, claimForTokenIssuer.issuer, claimForTokenIssuer.signature, claimForTokenIssuer.data, '');

    // // await token.connect(tokenAgent).mint(aliceWallet.address, 1000);
    // // await token.connect(tokenAgent).mint(bobWallet.address, 500);
    // await token.connect(tokenAgent).mint(tokenIssuer.address, 1000);
    // await token.connect(tokenIssuer).transfer(aliceWallet.address, 1000);
    // await token.connect(tokenAgent).mint(tokenIssuer.address, 500);
    // await token.connect(tokenIssuer).transfer(bobWallet.address, 500);

    // await agentManager.connect(tokenAgent).addAgentAdmin(tokenAdmin.address);
    // await token.connect(deployer).addAgent(agentManager.address);
    // await identityRegistry.connect(deployer).addAgent(agentManager.address);

    return {
        accounts: {
            deployer,
            tokenIssuer,
            tokenAgent,
            tokenAdmin,
            claimIssuer,
            claimIssuerSigningKey,
            aliceActionKey,
            aliceWallet,
            bobWallet,
            charlieWallet,
            davidWallet,
            anotherWallet,
        },
        // identities: {
        //     aliceIdentity,
        //     bobIdentity,
        //     charlieIdentity,
        // },
        suite: {
            // claimIssuerContract,
            // claimTopicsRegistry,
            // trustedIssuersRegistry,
            // identityRegistryStorage,
            // defaultCompliance,
            // identityRegistry,
            // tokenOnchainID,
            // token,
            // agentManager,
            trexGatewayContract,
            trexFactory,
            stoRegistry,
            tokenHolderFactory
        },
        authorities: {
            trexImplementationAuthority,
            identityImplementationAuthority,
        },
        factories: {
            trexFactory,
            identityFactory,
        },
        implementations: {
            identityImplementation,
            claimTopicsRegistryImplementation,
            trustedIssuersRegistryImplementation,
            identityRegistryStorageImplementation,
            identityRegistryImplementation,
            modularComplianceImplementation,
            tokenImplementation,
        },
    };
}

// export async function deploySuiteWithModularCompliancesFixture() {
//   const context = await loadFixture(deployFullSuiteFixture);

//   const complianceProxy = await ethers.deployContract('ModularComplianceProxy', [context.authorities.trexImplementationAuthority.address]);
//   const compliance = await ethers.getContractAt('ModularCompliance', complianceProxy.address);

//   const complianceBeta = await ethers.deployContract('ModularCompliance');
//   await complianceBeta.init();

//   return {
//     ...context,
//     suite: {
//       ...context.suite,
//       compliance,
//       complianceBeta,
//     },
//   };
// }

// // 全体のコンプライアンスシステムを管理するModularCompliance
// export async function deploySuiteWithModuleComplianceBoundToWallet() {
//   const context = await loadFixture(deployFullSuiteFixture);

//   const compliance = await ethers.deployContract('ModularCompliance');
//   await compliance.init();

//   const complianceModuleA = await ethers.deployContract('CountryAllowModule');
//   await compliance.addModule(complianceModuleA.address);
//   const complianceModuleB = await ethers.deployContract('CountryAllowModule');
//   await compliance.addModule(complianceModuleB.address);

//   await compliance.bindToken(context.accounts.charlieWallet.address);

//   return {
//     ...context,
//     suite: {
//       ...context.suite,
//       compliance,
//       complianceModuleA,
//       complianceModuleB,
//     },
//   };
// }