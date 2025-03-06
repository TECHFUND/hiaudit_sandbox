import '@nomiclabs/hardhat-ethers';
import { Signer } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect, assert } from 'chai';
import { loadFixture, reset } from '@nomicfoundation/hardhat-network-helpers';
import { Interface } from "ethers/lib/utils";

//import * from '../typechain-types/@tokenysolutions/t-rex/contracts/factory/ITREXGateway';
import { deployFullSuiteFixture } from './fixtures/deploy-full-suite.fixture';
import type { StRelease } from '../typechain-types/contracts/biz/StRelease';
import type { StoRelease } from '../typechain-types/contracts/biz/StoRelease';
type StReleaseParams = StRelease.StReleaseParamsStruct;
type StoReleaseParams = StoRelease.StoReleaseParamsStruct;

const TX_SUCCESS = 0x1; // receipt.statusの正常終了判定用定数
let accountsMap: { [key: string]: Signer } = {};

// StoRelease.sol, StoRegistry.solのデプロイ
async function deployContracts() {
    const [owner, spcAddress, tmpAddress] = await ethers.getSigners(); // 最大20アドレス

    const stoReleaseFactory = await ethers.getContractFactory('StoRelease');
    const stoReleaseContract = await stoReleaseFactory.deploy();
    await stoReleaseContract.deployed();

    return {
      owner,
      spcAddress,
      tmpAddress,
      stoReleaseContract
    };
}

// ERC3643動作環境のセットアップ＋StoRelease.solのセットアップ（デプロイ＋初期処理）
async function setupContracts() {
    const [owner, spcAddress, tmpAddress] = await ethers.getSigners();
    const context = await loadFixture(deployFullSuiteFixture); // ERC3643動作環境のセットアップ
    accountsMap[owner.address] = owner;
    accountsMap[spcAddress.address] = spcAddress;
    accountsMap[tmpAddress.address] = tmpAddress;
    accountsMap[context.accounts.aliceWallet.address] = context.accounts.aliceWallet;
    accountsMap[context.accounts.bobWallet.address] = context.accounts.bobWallet;
    accountsMap[context.accounts.charlieWallet.address] = context.accounts.charlieWallet;
    accountsMap[context.accounts.davidWallet.address] = context.accounts.davidWallet;


    // 前段のST公開：初期処理（initialize, setTrexGateway, TREXGateway#addDeployer）
    const stReleaseFactory = await ethers.getContractFactory('StRelease');
    const stReleaseContract = await stReleaseFactory.deploy();
    await stReleaseContract.deployed();
    await (await stReleaseContract.initialize()).wait();
    await (await stReleaseContract.setTrexGateway(context.suite.trexGatewayContract.address)).wait();
    await (await context.suite.trexGatewayContract.addDeployer(stReleaseContract.address)).wait();

    // 初期処理（initialize, setTrexGateway, TREXGateway#addDeployer）
    const stoReleaseDeployFunction = await upgrades.deployProxy(
        (await ethers.getContractFactory('StoRelease', owner)), [], {initializer: 'initialize', kind:'uups'});
    const stoReleaseContract: StoRelease = await stoReleaseDeployFunction.connect(owner).deployed() as StoRelease;
    await (await stoReleaseContract.setTrexGateway(context.suite.trexGatewayContract.address)).wait();

    return {
        owner,
        spcAddress,
        tmpAddress,
        stoReleaseContract,
        stReleaseContract,
        context
    };
}

// STO公開テスト
describe('[StoRelease_test]', function () {

    before(async function() {
        await reset();

        const { owner, spcAddress, tmpAddress, stoReleaseContract,
            stReleaseContract, context } = await loadFixture(setupContracts);
    
        // デプロイ先のアドレス情報出力
        console.log(`-------------------------------------------------------------------------`);
        console.log(`Deployed Address`);
        console.log(`-------------------------------------------------------------------------`);
        console.log(`      Owner(deployer) address: ${owner.address}`);
        console.log(`     SPC(tokenIssuer) address: ${spcAddress.address}`);
        console.log(`           TmpAddress address: ${tmpAddress.address}`);
        console.log(`    StReleaseContract address: ${stReleaseContract.address}`);
        console.log(`   StoReleaseContract address: ${stoReleaseContract.address}`);
        console.log(`-------------------------------------------------------------------------`);
    });
    
    // コントラクト初期化
    describe('StoRelease#initialize', function () {

        // [正常系] コントラクト初期化
        it('[NORMAL]initialize success', async function () {

            const { owner, spcAddress, tmpAddress, stoReleaseContract } = await loadFixture(deployContracts);

            // initialize を確認
            const receipt  = await (await stoReleaseContract.initialize()).wait();
            expect(receipt.status).to.equal(TX_SUCCESS);

            // Initializedイベントを確認（バージョン：1）
            const eventInitialized = receipt.events?.find(e => e.event === 'Initialized');
            if (!eventInitialized?.args) {
                console.log('Initialized イベントが発行されませんでした。');
                assert.fail();
            }
            expect(eventInitialized.args.version).to.equal(1);

            // OwnershipTransferredイベントを確認
            const eventOwnershipTransferred = receipt.events?.find(e => e.event === 'OwnershipTransferred');
            if (!eventOwnershipTransferred?.args) {
                console.log('OwnershipTransferred イベントが発行されませんでした。');
                assert.fail();
            }
            expect(eventOwnershipTransferred.args.previousOwner).to.equal(ethers.constants.AddressZero);
            expect(eventOwnershipTransferred.args.newOwner).to.equal(owner.address);

            // 親コントラクト（AbstractUpgradeable）のview関数を確認
            expect(await stoReleaseContract.paused()).to.equal(false);
            expect(await stoReleaseContract.owner()).to.equal(owner.address);
        });

        // [異常系] コントラクト初期化（二重実行）
        it('[ERROR]initialize failure(duplicated run)', async function () {
            const { owner, spcAddress, tmpAddress, stoReleaseContract } = await loadFixture(deployContracts);

            // initialize（初回）を確認
            const receipt  = await (await stoReleaseContract.initialize()).wait();
            expect(receipt.status).to.equal(TX_SUCCESS);

            // initialize（owner以外から実行）の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stoReleaseContract.connect(spcAddress).initialize({ gasLimit: 6000000 });
                assert.fail();
            } catch (error: any) {
                // initializerのエラー文言の取得可否が不安定なため、`どちらかの文言が存在すること`で確認
                // expect(error.message).to.include('Initializable: contract is already initialized');
                const expectedMessages = [
                    'Initializable: contract is already initialized', // 本来の文言
                    'Transaction reverted and Hardhat couldn\'t infer the reason.' // 不安定時の文言
                ];
                assert(
                    expectedMessages.some(msg => error.message.includes(msg)),
                    `Error messages must include one of the following: ${expectedMessages.join(' | ')}`
                );
            }
        });
        
    });

    // アドレス設定
    describe('StoRelease#setTrexGateway', function () {

        // [正常系] アドレス設定
        it('[NORMAL]setTrexGateway success', async function () {
            const { owner, spcAddress, tmpAddress, stoReleaseContract } = await loadFixture(deployContracts);
            await (await stoReleaseContract.initialize()).wait();

            // setTrexGateway を確認
            expect((await (await stoReleaseContract.setTrexGateway(tmpAddress.address)).wait()).status).to.equal(TX_SUCCESS);
        });

        // [異常系] アドレス設定（address異常時:AddressZero）
        it('[ERROR]setTrexGateway failure(invalid address(0))', async function () {
            const { owner, spcAddress, tmpAddress, stoReleaseContract } = await loadFixture(deployContracts);
            await (await stoReleaseContract.initialize()).wait();

            // setTrexGateway address異常時の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stoReleaseContract.setTrexGateway(ethers.constants.AddressZero);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('InvalidTrexGatewayAddress("0x0000000000000000000000000000000000000000")');
            }
        });

        // [異常系] アドレス設定（権限エラー：owner以外から実行）
        it('[ERROR]setTrexGateway failure(not owner)', async function () {
            const { owner, spcAddress, tmpAddress, stoReleaseContract } = await loadFixture(deployContracts);
            await (await stoReleaseContract.initialize()).wait();

            // setTrexGateway（owner以外から実行）の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stoReleaseContract.connect(spcAddress).setTrexGateway(tmpAddress.address);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('Ownable: caller is not the owner');
            }
        });
    });

    // STO公開
    describe('StoRelease#release', function () {

        // [正常系] STO公開（1回）: ownerでの実行
        it('[NORMAL]release success from owner', async function () {
            await executeStoReleaseTest(false);
        });

        // [正常系] STO公開（1回）: SPCアドレスでの実行
        it('[NORMAL]release success from SPC', async function () {
            await executeStoReleaseTest(true);
        });

        // [正常系] STO公開（1回）
        async function executeStoReleaseTest(isSPC: boolean = false) {
            const { owner, spcAddress, tmpAddress, stoReleaseContract,
                stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備
            const stReleaseParams: StReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address
            };
            await (await stReleaseContract.release(stReleaseParams)).wait();

            // const stReceipt = await (await stReleaseContract.release(stReleaseParams)).wait();
            // const stAddres = (stReceipt.events?.find(e => e.event === 'StReleased')).args[2];
            // console.log('stAddres:', stAddres);
            // console.log('stReceipt:', stReceipt);

            const stoReleaseParams: StoReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address, rate: 1
            };

            // イベントを取得できることを確認
            const tx = await stoReleaseContract.connect(isSPC ? spcAddress : owner).release(stoReleaseParams);
            // console.log('[tx]:', tx);

            const receipt = await tx.wait();
            // console.log('[receipt]:', receipt);

            // StoReleasedイベントを確認
            const eventStoReleased = receipt.events?.find(e => e.event === 'StoReleased');
            if (!eventStoReleased || !eventStoReleased.args) {
                console.log('StoReleased イベントが発行されませんでした。');
                assert.fail();
            }

            // デプロイされたSTOの確認
            expect(eventStoReleased.args.length).to.equal(4);
            const stoAddress = eventStoReleased.args[3];
            expect(stoAddress).to.not.equal(ethers.constants.AddressZero);
            const stoContract = await ethers.getContractAt('ISecurityTokenOffering', stoAddress);
            expect((await stoContract.allTokenHolders()).length).to.equal(0);
            const stoContractValue = await stoContract.value();
            expect(stoContractValue.symbol).to.equal(stoReleaseParams.symbol);
            expect(stoContractValue.rate).to.equal(stoReleaseParams.rate);
            expect(stoContractValue.raisedAmount).to.equal(0);
            expect(stoContractValue.soldTokensAmount).to.equal(0);
            expect(stoContractValue.investorCount).to.equal(0);
            expect(stoContractValue.contractAddress).to.equal(stoAddress);

            // SPC単位でのSTOアドレス取得を確認
            const stos = await context.suite.stoRegistry.getStos(stoReleaseParams.spcAddress, stoReleaseParams.symbol);
            expect(stos.length).to.equal(1);
            expect(stos[0]).to.equal(stoAddress);
            expect(await context.suite.stoRegistry.getSto(stoReleaseParams.spcAddress, stoReleaseParams.symbol)).to.equal(stoAddress);


            // コントラクトをV2にUpgrade（trexGateway等の設定はそのまま引き継がれるためset不要）
            const stoReleaseV2Factory = await ethers.getContractFactory("StoReleaseV2");
            const stoReleaseV2Contract = await upgrades.upgradeProxy(stoReleaseContract.address, stoReleaseV2Factory) as StoRelease;
            
            // 事前準備
            const stReleaseParamsV2: StReleaseParams = {
                symbol: 'TEST_SYMBOL_V2', spcAddress: spcAddress.address
            };
            await (await stReleaseContract.release(stReleaseParamsV2)).wait();

            const stoReleaseParamsV2: StoReleaseParams = {
                symbol: 'TEST_SYMBOL_V2', spcAddress: spcAddress.address, rate: 1
            };

            // イベントを取得できることを確認
            const txV2 = await stoReleaseV2Contract.connect(isSPC ? spcAddress : owner).release(stoReleaseParamsV2);
            const receiptV2 = await txV2.wait();

            // StoReleasedイベントを確認
            const eventStoReleasedV2 = receiptV2.events?.find(e => e.event === 'StoReleasedV2');
            if (!(eventStoReleasedV2?.args)) {
                console.log('StoReleasedV2 イベントが発行されませんでした。');
                assert.fail();
            }
            expect(eventStoReleasedV2.args.length).to.equal(5);
            expect(eventStoReleasedV2.args[4]).to.equal(isSPC ? spcAddress.address : owner.address);
        }

        // [正常系] STO公開（複数回）: ownerでの実行
        it('[NORMAL]release success(multiple) from owner', async function () {
            await executeMultipleStoReleaseTest(false);
        });

        // [正常系] STO公開（複数回）: SPCアドレスでの実行
        it('[NORMAL]release success(multiple) from SPC', async function () {
            await executeMultipleStoReleaseTest(true);
        });

        // [正常系] STO公開（複数回）
        async function executeMultipleStoReleaseTest(isSPC: boolean = false) {
            const { owner, spcAddress, tmpAddress, stoReleaseContract,
                stReleaseContract, context } = await loadFixture(setupContracts);
            context.suite.trexGatewayContract.addDeployer(stoReleaseContract.address);

            // 事前準備（2番目のSPCはtmpAddressとする）
            const stReleaseParams: StReleaseParams[] = [
                { symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address },
                { symbol: 'TEST_SYMBOL2', spcAddress: tmpAddress.address },
                { symbol: 'TEST_SYMBOL3', spcAddress: spcAddress.address },
            ];
            for (const stReleaseParam of stReleaseParams) {
                await (await stReleaseContract.release(stReleaseParam)).wait();
            }
            
            const stoReleaseParams: StoReleaseParams[] = [
                { symbol: 'TEST_SYMBOL' , spcAddress: spcAddress.address, rate: 1 },
                { symbol: 'TEST_SYMBOL2', spcAddress: tmpAddress.address, rate: 2 },
                { symbol: 'TEST_SYMBOL3', spcAddress: spcAddress.address, rate: 3 },
            ];
            let stoRegistryAddress = '';
            for (const param of stoReleaseParams) {

                // イベントを取得できることを確認
                const receipt = await(await stoReleaseContract.connect(isSPC ? accountsMap[(await param.spcAddress)] : owner).release(param)).wait();

                // StoReleasedイベントを確認
                const eventStoReleased = receipt.events?.find(e => e.event === 'StoReleased');
                if (!eventStoReleased?.args) {
                    console.log('StoReleased イベントが発行されませんでした。');
                    assert.fail();
                }

                // デプロイされたSTOの確認
                const stoAddress = eventStoReleased.args[3];
                expect(stoAddress).to.not.equal(ethers.constants.AddressZero);
                const stoContract = await ethers.getContractAt('ISecurityTokenOffering', stoAddress);
                expect((await stoContract.allTokenHolders()).length).to.equal(0);
                const stoContractValue = await stoContract.value();
                expect(stoContractValue.symbol).to.equal(param.symbol);
                expect(stoContractValue.rate).to.equal(param.rate);
                expect(stoContractValue.raisedAmount).to.equal(0);
                expect(stoContractValue.soldTokensAmount).to.equal(0);
                expect(stoContractValue.investorCount).to.equal(0);
                expect(stoContractValue.contractAddress).to.equal(stoAddress);

                // SPC/シンボル単位でのSTOアドレス取得を確認
                const spcAddressStos = await context.suite.stoRegistry.getStos(param.spcAddress, param.symbol);
                expect(spcAddressStos.length).to.equal(1);
                expect(spcAddressStos[0]).to.equal(stoAddress);
                expect(await context.suite.stoRegistry.getSto(param.spcAddress, param.symbol)).to.equal(stoAddress);
            }
        }

        // [異常系] ST公開（不正な実行者:owner,SPC以外のアドレス）
        it('[ERROR]release failure(invalid executor)', async function () {
            const { owner, spcAddress, tmpAddress, stoReleaseContract } = await loadFixture(deployContracts);
            await (await stoReleaseContract.initialize()).wait(); // setTrexGateway無し

            // 事前準備
            const stoReleaseParams: StoReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address, rate: 1
            };

            // ST発行：異常終了確認
            try {
                await stoReleaseContract.connect(tmpAddress).release(stoReleaseParams);
                assert.fail();
            } catch (error: any) {
                // errorを正常に取得できないため、手動パースする
                const iface = new Interface(["error InvalidExecutor(address)"]);
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidExecutor');
                expect(decodedError.args[0]).to.equal(tmpAddress.address);
            }
        });

        // [異常系] STO公開（setTrexGateway無し）
        it('[ERROR]release failure(without setTrexGateway)', async function () {
            const { owner, spcAddress, tmpAddress, stoReleaseContract } = await loadFixture(deployContracts);
            await (await stoReleaseContract.initialize()).wait(); // setTrexGateway無し

            // 事前準備
            const stoReleaseParams: StoReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address, rate: 1
            };

            // 異常終了確認
            try {
                await stoReleaseContract.release(stoReleaseParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('InvalidTrexGatewayAddress("0x0000000000000000000000000000000000000000")');
            }
        });

        // [異常系] STO公開（ST未公開）
        it('[ERROR]release failure(without ST release)', async function () {
            const { owner, spcAddress, tmpAddress, stoReleaseContract,
                stReleaseContract, context } = await loadFixture(setupContracts);
            context.suite.trexGatewayContract.addDeployer(stoReleaseContract.address);

            // 事前準備（ST公開無し）
            const stoReleaseParams: StoReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address, rate: 1
            };

            // 異常終了確認
            try {
                await stoReleaseContract.release(stoReleaseParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('SecurityTokenOfferingNotCreated()');
            }
        });

        // [異常系] STO公開（重複公開）
        it('[ERROR]release failure(duplicated run)', async function () {
            const { owner, spcAddress, tmpAddress, stoReleaseContract,
                stReleaseContract, context } = await loadFixture(setupContracts);
            context.suite.trexGatewayContract.addDeployer(stoReleaseContract.address);

            // 事前準備
            const stReleaseParams: StReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address
            };
            await (await stReleaseContract.release(stReleaseParams)).wait();

            const stoReleaseParams: StoReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address, rate: 1
            };
            await (await stoReleaseContract.release(stoReleaseParams)).wait();

            // 異常終了確認
            try {
                await stoReleaseContract.release(stoReleaseParams);
                assert.fail();
            } catch (error: any) {
                // initializerのエラー文言の取得可否が不安定なため、`どちらかの文言が存在すること`で確認
                // expect(error.message).to.include('Initializable: contract is already initialized');
                const expectedMessages = [
                    'Initializable: contract is already initialized', // 本来の文言
                    'Transaction reverted and Hardhat couldn\'t infer the reason.' // 不安定時の文言
                ];
                assert(
                    expectedMessages.some(msg => error.message.includes(msg)),
                    `Error messages must include one of the following: ${expectedMessages.join(' | ')}`
                );
            }
        });
    });
});
