import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import '@nomiclabs/hardhat-ethers';
import OnchainID from '@onchain-id/solidity';

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 連続してデプロイするとRPCサーバが無応答になる事象が発生するため、インターバルを空けながら進捗確認用のログも出力する
async function intervalMessage(message: string, ms: number = 5000) { // デフォルト5秒
    const datetime = new Date();
    const header = datetime.getFullYear()
        + '/' + ('0' + (datetime.getMonth() + 1)).slice(-2)
        + '/' + ('0' + datetime.getDate()).slice(-2)
        + ' ' + ('0' + datetime.getHours()).slice(-2)
        + ':' + ('0' + datetime.getMinutes()).slice(-2)
        + ':' + ('0' + datetime.getSeconds()).slice(-2)
        + '.' + ('00' + datetime.getMilliseconds()).slice(-3);
    console.log(`${header} ${message}`);
    await sleep(ms);
}

// 【注記】：デプロイ時にバージョンを適宜インクリメントすること
async function deploy() {
    const versionStruct = {
        major: 0,
        minor: 0,
        patch: 1,
    };

    // コントラクトをデプロイするアカウントのアドレスを.envから取得（hardhat.config.ts 参照）
    const [deployer] = await ethers.getSigners();

    await intervalMessage('deploying contracts...\n', 0);

    // 準初期化処理
    // 実装コントラクトのデプロイ
    const claimTopicsRegistryImplementation = await ethers.deployContract('ClaimTopicsRegistry', deployer);
    await intervalMessage('ClaimTopicsRegistry deployed');
    const trustedIssuersRegistryImplementation = await ethers.deployContract('TrustedIssuersRegistry', deployer);
    await intervalMessage('TrustedIssuersRegistry deployed');
    const identityRegistryStorageImplementation = await ethers.deployContract('IdentityRegistryStorage', deployer);
    await intervalMessage('IdentityRegistryStorage deployed');
    const identityRegistryImplementation = await ethers.deployContract('IdentityRegistry', deployer);
    await intervalMessage('IdentityRegistry deployed');
    const modularComplianceImplementation = await ethers.deployContract('ModularCompliance', deployer);
    await intervalMessage('ModularCompliance deployed');
    const tokenImplementation = await ethers.deployContract('STLinkToken', deployer);
    await intervalMessage('STLinkToken deployed');
    const identityImplementation = await new ethers.ContractFactory(
        OnchainID.contracts.Identity.abi,
        OnchainID.contracts.Identity.bytecode,
        deployer,
    ).deploy(deployer.address, true);
    await intervalMessage('Identity deployed');

    // 各部品コントラクトのデプロイ
    const identityImplementationAuthority = await new ethers.ContractFactory(
        OnchainID.contracts.ImplementationAuthority.abi,
        OnchainID.contracts.ImplementationAuthority.bytecode,
        deployer,
    ).deploy(identityImplementation.address);
    await intervalMessage('ImplementationAuthority deployed');

    const identityFactory = await new ethers.ContractFactory(
        OnchainID.contracts.Factory.abi,
        OnchainID.contracts.Factory.bytecode,
        deployer
    ).deploy(identityImplementationAuthority.address);
    await intervalMessage('IdentityFactory deployed');

    const trexImplementationAuthority = await ethers.deployContract(
        'TREXImplementationAuthority',
        [true, ethers.constants.AddressZero, ethers.constants.AddressZero],
        deployer,
    );
    const contractsStruct = {
        tokenImplementation: tokenImplementation.address,
        ctrImplementation: claimTopicsRegistryImplementation.address,
        irImplementation: identityRegistryImplementation.address,
        irsImplementation: identityRegistryStorageImplementation.address,
        tirImplementation: trustedIssuersRegistryImplementation.address,
        mcImplementation: modularComplianceImplementation.address,
    };
    await trexImplementationAuthority.connect(deployer).addAndUseTREXVersion(versionStruct, contractsStruct);
    await intervalMessage('TREXImplementationAuthority deployed');

    const trexFactory = await ethers.deployContract('STLinkTREXFactory',
        [trexImplementationAuthority.address, identityFactory.address], deployer);
    await identityFactory.connect(deployer).addTokenFactory(trexFactory.address);
    await intervalMessage('STLinkTREXFactory deployed');

    const stoRegistry = await upgrades.deployProxy(
        (await ethers.getContractFactory('StoRegistry', deployer)), [], {initializer: 'initialize', kind:'uups'});
    await stoRegistry.connect(deployer).deployed(); // openzeppelin/hardhat-ethers v3側では『.waitForDeployment()』
    await intervalMessage('StoRegistry deployed');

    const tokenHolderFactory = await upgrades.deployProxy(
        (await ethers.getContractFactory('TokenHolderFactory', deployer)), [], {initializer: 'initialize', kind:'uups'});
    await tokenHolderFactory.connect(deployer).deployed();
    await intervalMessage('TokenHolderFactory deployed');

    const trexGatewayContract = await ethers.deployContract('STLinkTREXGateway',
        [trexFactory.address, stoRegistry.address, tokenHolderFactory.address, true], deployer);
    await trexFactory.transferOwnership(trexGatewayContract.address);
    await intervalMessage('STLinkTREXGateway deployed');

    // 業務コントラクトのデプロイ
    const stRelease = await upgrades.deployProxy(
      (await ethers.getContractFactory('StRelease', deployer)), [], {initializer: 'initialize', kind:'uups'});
    await stRelease.connect(deployer).deployed();
    await (await stRelease.connect(deployer).setTrexGateway(trexGatewayContract.address)).wait();
    await (await trexGatewayContract.connect(deployer).addDeployer(stRelease.address)).wait();
    await intervalMessage('StRelease deployed');

    const stoRelease = await upgrades.deployProxy(
      (await ethers.getContractFactory('StoRelease', deployer)), [], {initializer: 'initialize', kind:'uups'});
    await stoRelease.connect(deployer).deployed();
    await (await stoRelease.connect(deployer).setTrexGateway(trexGatewayContract.address)).wait();
    await intervalMessage('StoRelease deployed');

    const stIssue = await upgrades.deployProxy(
      (await ethers.getContractFactory('StIssue', deployer)), [], {initializer: 'initialize', kind:'uups'});
    await stIssue.connect(deployer).deployed();
    // setTrexGateway不要
    await intervalMessage('StIssue deployed');

    const stTransfer = await upgrades.deployProxy(
      (await ethers.getContractFactory('StTransfer', deployer)), [], {initializer: 'initialize', kind:'uups'});
    await stTransfer.connect(deployer).deployed();
    await (await stTransfer.connect(deployer).setTrexGateway(trexGatewayContract.address)).wait();
    await intervalMessage('StTransfer deployed');

    const stRepayment = await upgrades.deployProxy(
      (await ethers.getContractFactory('StRepayment', deployer)), [], {initializer: 'initialize', kind:'uups'});
    await stRepayment.connect(deployer).deployed();
    await (await stRepayment.connect(deployer).setTrexGateway(trexGatewayContract.address)).wait();
    await intervalMessage('StRepayment deployed', 0);

    const stReference = await upgrades.deployProxy(
      (await ethers.getContractFactory('StReference', deployer)), [], {initializer: 'initialize', kind:'uups'});
    await stReference.connect(deployer).deployed();
    await (await stReference.connect(deployer).setTrexGateway(trexGatewayContract.address)).wait();
    await intervalMessage('StReference deployed');

    const assignmentOfReceivableRecord = await upgrades.deployProxy(
      (await ethers.getContractFactory('AssignmentOfReceivableRecord', deployer)), [], {initializer: 'initialize', kind:'uups'});
    await assignmentOfReceivableRecord.connect(deployer).deployed();
    await intervalMessage('AssignmentOfReceivableRecord deployed', 0);

    // 各アドレスの出力
    console.log(`\n-----------------------------------------------------------------------------`);
    console.log(`Deployment Results (${versionStruct.major}.${versionStruct.minor}.${versionStruct.patch})`);
    console.log(`-----------------------------------------------------------------------------`);
    console.log(`[Wallet Address]`);
    console.log(`                         deployer: ${deployer.address}`);
    console.log(`-----------------------------------------------------------------------------`);
    console.log(`[Contract(Implementation) Address]`);
    console.log(`              ClaimTopicsRegistry: ${claimTopicsRegistryImplementation.address}`);
    console.log(`           TrustedIssuersRegistry: ${trustedIssuersRegistryImplementation.address}`);
    console.log(`          IdentityRegistryStorage: ${identityRegistryStorageImplementation.address}`);
    console.log(`                 IdentityRegistry: ${identityRegistryImplementation.address}`);
    console.log(`                ModularCompliance: ${modularComplianceImplementation.address}`);
    console.log(`               Token(STLinkToken): ${tokenImplementation.address}`);
    console.log(`              Identity(OnchainID): ${identityImplementation.address}`);
    console.log(`-----------------------------------------------------------------------------`);
    console.log(`[Contract Address]`);
    console.log(`   TREXGateway(STLinkTREXGateway): ${trexGatewayContract.address}`);
    console.log(`   TREXFactory(STLinkTREXFactory): ${trexFactory.address}`);
    console.log(`                      StoRegistry: ${stoRegistry.address}`);
    console.log(`               TokenHolderFactory: ${tokenHolderFactory.address}`);
    console.log(`                  IdentityFactory: ${identityFactory.address}`);
    console.log(`  IdentityImplementationAuthority: ${identityImplementationAuthority.address}`);
    console.log(`      TrexImplementationAuthority: ${trexImplementationAuthority.address}`);
    console.log(` `);
    console.log(`                        StRelease: ${stRelease.address}`);
    console.log(`                       StoRelease: ${stoRelease.address}`);
    console.log(`                          StIssue: ${stIssue.address}`);
    console.log(`                       StTransfer: ${stTransfer.address}`);
    console.log(`                      StRepayment: ${stRepayment.address}`);
    console.log(`                      StReference: ${stReference.address}`);
    console.log(`     AssignmentOfReceivableRecord: ${assignmentOfReceivableRecord.address}`);
    console.log(`-----------------------------------------------------------------------------\n`);
}

deploy()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });

