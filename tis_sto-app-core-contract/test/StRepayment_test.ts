import '@nomiclabs/hardhat-ethers';
import { BigNumber, Signer } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect, assert } from 'chai';
import { loadFixture, reset } from '@nomicfoundation/hardhat-network-helpers';
import { Interface } from "ethers/lib/utils";

// import * from '../typechain-types/@tokenysolutions/t-rex/contracts/factory/ITREXGateway';
import { deployFullSuiteFixture } from './fixtures/deploy-full-suite.fixture';
import type { StRelease } from '../typechain-types/contracts/biz/StRelease';
import type { StoRelease } from '../typechain-types/contracts/biz/StoRelease';
import type { StIssue } from '../typechain-types/contracts/biz/StIssue';
import type { StRepayment } from '../typechain-types/contracts/biz/StRepayment';

type StReleaseParams = StRelease.StReleaseParamsStruct;
type StoReleaseParams = StoRelease.StoReleaseParamsStruct;
type StIssueParams = StIssue.StIssueParamsStruct;
type StRepaymentParams = StRepayment.StRepaymentParamsStruct;

const TX_SUCCESS = 0x1; // receipt.statusの正常終了判定用定数
const NOW = Math.floor(Date.now() / 1000);
const YESTERDAY = NOW - 60 * 60 * 24; // 昨日
const TOMORROW = NOW + 60 * 60 * 24; // 翌日
const LAST_WEEK = NOW - 60 * 60 * 24 * 7; // 先週
const NEXT_WEEK = NOW + 60 * 60 * 24 * 7; // 来週
let accountsMap: { [key: string]: Signer } = {};

// StRepayment.solのデプロイ
async function deployContracts() {
    const [owner, spcAddress, tmpAddress] = await ethers.getSigners(); // 最大20アドレス

    const stRepaymentFactory = await ethers.getContractFactory('StRepayment');
    const stRepaymentContract = await stRepaymentFactory.deploy();
    await stRepaymentContract.deployed();

    return {
      owner,
      spcAddress,
      tmpAddress,
      stRepaymentContract
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

    // 前段のSTO公開：初期処理（initialize, setTrexGateway）
    const stoReleaseFactory = await ethers.getContractFactory('StoRelease');
    const stoReleaseContract = await stoReleaseFactory.deploy();
    await stoReleaseContract.deployed();
    await (await stoReleaseContract.initialize()).wait();
    await (await stoReleaseContract.setTrexGateway(context.suite.trexGatewayContract.address)).wait();

    // 前段のST発行：初期処理（initialize）
    const stIssueFactory = await ethers.getContractFactory('StIssue');
    const stIssueContract = await stIssueFactory.deploy();
    await stIssueContract.deployed();
    await (await stIssueContract.initialize()).wait();

    // 初期処理（initialize, setTrexGateway）
    const stRepaymentDeployFunction = await upgrades.deployProxy(
        (await ethers.getContractFactory('StRepayment', owner)), [], {initializer: 'initialize', kind:'uups'});
    const stRepaymentContract: StRepayment = await stRepaymentDeployFunction.connect(owner).deployed() as StRepayment;
    await (await stRepaymentContract.setTrexGateway(context.suite.trexGatewayContract.address)).wait();

    return {
        owner,
        spcAddress,
        tmpAddress,
        stRepaymentContract,
        stIssueContract,
        stoReleaseContract,
        stReleaseContract,
        context
    };
}

// ST償還テスト
describe('[StRepayment_test]', function () {

    before(async function() {
        this.timeout(10000);
        await reset();
        const { owner, spcAddress, tmpAddress, stRepaymentContract, stIssueContract,
            stoReleaseContract, stReleaseContract, context } = await loadFixture(setupContracts);

        // デプロイ先のアドレス情報出力
        console.log(`-------------------------------------------------------------------------`);
        console.log(`Deployed Address`);
        console.log(`-------------------------------------------------------------------------`);
        console.log(`      Owner(deployer) address: ${owner.address}`);
        console.log(`     SPC(tokenIssuer) address: ${spcAddress.address}`);
        console.log(`           TmpAddress address: ${tmpAddress.address}`);
        console.log(`    StReleaseContract address: ${stReleaseContract.address}`);
        console.log(`   StoReleaseContract address: ${stoReleaseContract.address}`);
        console.log(`      StIssueContract address: ${stIssueContract.address}`);
        console.log(`  StRepaymentContract address: ${stRepaymentContract.address}`);
        console.log(`-------------------------------------------------------------------------`);
        console.log(`          aliceWallet address: ${context.accounts.aliceWallet.address}`);
        console.log(`            bobWallet address: ${context.accounts.bobWallet.address}`);
        console.log(`        charlieWallet address: ${context.accounts.charlieWallet.address}`);
        console.log(`          davidWallet address: ${context.accounts.davidWallet.address}`);
        console.log(`-------------------------------------------------------------------------`);
    });

    // コントラクト初期化
    describe('StRepayment#initialize', function () {

        // [正常系] コントラクト初期化
        it('[NORMAL]initialize success', async function () {
            const { owner, spcAddress, tmpAddress, stRepaymentContract } = await loadFixture(deployContracts);

            // initialize を確認
            const receipt  = await (await stRepaymentContract.initialize()).wait();
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
            expect(await stRepaymentContract.paused()).to.equal(false);
            expect(await stRepaymentContract.owner()).to.equal(owner.address);
        });

        // [異常系] コントラクト初期化（二重実行）
        it('[ERROR]initialize failure(duplicated run)', async function () {
            const { owner, spcAddress, tmpAddress, stRepaymentContract } = await loadFixture(deployContracts);

            // initialize（初回）を確認
            const receipt  = await (await stRepaymentContract.initialize()).wait();
            expect(receipt.status).to.equal(TX_SUCCESS);

            // initialize（owner以外から実行）の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stRepaymentContract.connect(spcAddress).initialize({ gasLimit: 6000000 });
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
    describe('StRepayment#setTrexGateway', function () {

        // [正常系] アドレス設定
        it('[NORMAL]setTrexGateway success', async function () {
            const { owner, spcAddress, tmpAddress, stRepaymentContract } = await loadFixture(deployContracts);
            await (await stRepaymentContract.initialize()).wait();

            // setTrexGateway を確認
            expect((await (await stRepaymentContract.setTrexGateway(tmpAddress.address)).wait()).status).to.equal(TX_SUCCESS);
        });

        // [異常系] アドレス設定（address異常時:AddressZero）
        it('[ERROR]setTrexGateway failure(invalid address(0))', async function () {
            const { owner, spcAddress, tmpAddress, stRepaymentContract } = await loadFixture(deployContracts);
            await (await stRepaymentContract.initialize()).wait();

            // setTrexGateway address異常時の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stRepaymentContract.setTrexGateway(ethers.constants.AddressZero);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('InvalidTrexGatewayAddress("0x0000000000000000000000000000000000000000")');
            }
        });

        // [異常系] アドレス設定（権限エラー：owner以外から実行）
        it('[ERROR]setTrexGateway failure(not owner)', async function () {
            const { owner, spcAddress, tmpAddress, stRepaymentContract } = await loadFixture(deployContracts);
            await (await stRepaymentContract.initialize()).wait();

            // setTrexGateway（owner以外から実行）の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stRepaymentContract.connect(spcAddress).setTrexGateway(tmpAddress.address);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('Ownable: caller is not the owner');
            }
        });
    });

    // ST償還
    describe('StRepayment#repay', function () {

        // [正常系] ST償還（1回）: ownerでの実行
        it('[NORMAL]repay success from owner', async function () {
            await executeStRepaymentTest(false);
        });

        // [正常系] ST償還（1回）: SPCアドレスでの実行
        it('[NORMAL]repay success from SPC', async function () {
            await executeStRepaymentTest(true);
        });

        // [正常系] ST償還（1回）
        async function executeStRepaymentTest(isSPC: boolean = false) {
            const { owner, spcAddress, tmpAddress, stRepaymentContract, stIssueContract,
                stoReleaseContract, stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備
            // ST公開・STO公開・ST発行
            const stReleaseParams: StReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address
            };
            await (await stReleaseContract.release(stReleaseParams)).wait();
            const stoReleaseParams: StoReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address, rate: 2
            };
            const stoReleasedReceipt = await (await stoReleaseContract.release(stoReleaseParams)).wait();
            const eventStoReleased = stoReleasedReceipt.events?.find(e => e.event === 'StoReleased');
            if (!eventStoReleased?.args) {
                console.log('StoReleased イベントが発行されませんでした。');
                assert.fail();
            }
            const stoAddress = eventStoReleased.args[3];
            const stIssueParams: StIssueParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                stoAddress: stoAddress,
                investor: context.accounts.aliceWallet.address,
                amount: 1000, // 購入レート:2 のため購入量:2000
                timeCanReceiveAfter: NEXT_WEEK,
                timeCanSendAfter: NOW,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            };
            await (await stIssueContract.issue(stIssueParams)).wait();

            // ST償還パラメータ
            const stRepaymentParams: StRepaymentParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                from: context.accounts.aliceWallet.address,
                amount: 500 // 償還には購入レートが掛からないため償還量:500
            };
            const tx = await stRepaymentContract.connect(isSPC ? spcAddress : owner).repay(stRepaymentParams);
            // console.log('[tx]:', tx);

            const receipt = await tx.wait();
            // console.log('[receipt]:', receipt);

            // StRepaymentイベントを確認
            const eventStRepayed = receipt.events?.find(e => e.event === 'StRepayed');
            if (!eventStRepayed?.args) {
                console.log('StRepayed イベントが発行されませんでした。');
                assert.fail();
            }

            expect(eventStRepayed.args.length).to.equal(4);
            expect(eventStRepayed.args[0]._isIndexed).to.equal(true);
            expect(eventStRepayed.args[0].hash).to.equal(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(await stRepaymentParams.symbol)));
            expect(eventStRepayed.args[1]).to.equal(stRepaymentParams.spcAddress);
            expect(eventStRepayed.args[2]).to.equal(stRepaymentParams.from);
            expect(eventStRepayed.args[3]).to.equal(stRepaymentParams.amount);

            // SPC単位でのTokenアドレス取得を確認
            const securityTokensArray = await context.suite.trexFactory.getSecurityTokens(spcAddress.address);
            expect(securityTokensArray.length).to.equal(1);
            expect(securityTokensArray[0]).to.not.equal(ethers.constants.AddressZero);
            const tokenContract = await ethers.getContractAt('ISTLinkToken', securityTokensArray[0]);
            expect(await tokenContract.totalSupply()).to.equal(
                    BigNumber.from(stIssueParams.amount).mul(BigNumber.from(stoReleaseParams.rate)).sub(BigNumber.from(stRepaymentParams.amount))); // 1500
            expect(await tokenContract.balanceOf(context.accounts.aliceWallet.address)).to.equal(
                    BigNumber.from(stIssueParams.amount).mul(BigNumber.from(stoReleaseParams.rate)).sub(BigNumber.from(stRepaymentParams.amount))); // 1500

            // STO単位でのトークンホルダ情報取得を確認
            expect(await context.suite.stoRegistry.getSto(stIssueParams.spcAddress, stIssueParams.symbol)).to.equal(stoAddress);
            const stoContract = await ethers.getContractAt('ISecurityTokenOffering', stoAddress);
            const allTokenHolders = await stoContract.allTokenHolders();
            expect(allTokenHolders.length).to.equal(1); // 1名

            // STO：償還をしても全額でなければ投資家数が減少しない（他も不変）になることの確認
            const stos = await context.suite.stoRegistry.getStos(stIssueParams.spcAddress, stIssueParams.symbol);
            expect(stos.length).to.equal(1);
            expect(stos[0]).to.equal(stoAddress);

            const stoValue = await stoContract.value();
            expect(stoValue.symbol).to.equal(stoReleaseParams.symbol);
            expect(stoValue.rate).to.equal(stoReleaseParams.rate);
            const expectedAmount = BigNumber.from(stIssueParams.amount).mul(BigNumber.from(stoReleaseParams.rate));
            expect(stoValue.raisedAmount).to.equal(expectedAmount); // Polymathの仕様を踏襲し、償還による減算は実施しない
            expect(stoValue.soldTokensAmount).to.equal(expectedAmount); // Polymathの仕様を踏襲し、償還による減算は実施しない
            expect(stoValue.investorCount).to.equal(1); // 1人
            expect(stoValue.contractAddress).to.equal(stoAddress);

            
            // コントラクトをV2にUpgrade（trexGateway等の設定はそのまま引き継がれるためset不要）
            const stRepaymentV2Factory = await ethers.getContractFactory("StRepaymentV2");
            const stRepaymentV2Contract = await upgrades.upgradeProxy(stRepaymentContract.address, stRepaymentV2Factory) as StRepayment;
            
            // 事前準備
            const stRepaymentParamsV2: StRepaymentParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                from: context.accounts.aliceWallet.address,
                amount: 500
            };

            // イベントを取得できることを確認
            const txV2 = await stRepaymentV2Contract.connect(isSPC ? spcAddress : owner).repay(stRepaymentParamsV2);
            const receiptV2 = await txV2.wait();

            // StRepaymentdイベントを確認
            const eventStRepayedV2 = receiptV2.events?.find(e => e.event === 'StRepayedV2');
            if (!(eventStRepayedV2?.args)) {
                console.log('StRepayedV2 イベントが発行されませんでした。');
                assert.fail();
            }
            expect(eventStRepayedV2.args.length).to.equal(5);
            expect(eventStRepayedV2.args[4]).to.equal(isSPC ? spcAddress.address : owner.address);
        }

        // [正常系] ST償還（複数回）: ownerでの実行
        it('[NORMAL]repay success(multiple) from owner', async function () {
            await executeMultipleStRepaymentTest(false);
        });

        // [正常系] ST償還（複数回）: SPCアドレスでの実行
        it('[NORMAL]repay success(multiple) from SPC', async function () {
            await executeMultipleStRepaymentTest(true);
        });

        // [正常系] ST償還（複数回）
        //  発行: A(1000), B(1000), C(1000)
        //  償還: A(100),  B(1000), C(700)
        async function executeMultipleStRepaymentTest(isSPC: boolean = false) {
            const { owner, spcAddress, tmpAddress, stRepaymentContract, stIssueContract,
                stoReleaseContract, stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備
            // ST公開・STO公開・ST発行
            const stReleaseParams: StReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address
            };
            await (await stReleaseContract.release(stReleaseParams)).wait();
            const stoReleaseParams: StoReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address, rate: 1
            };
            const stoReleasedReceipt = await (await stoReleaseContract.release(stoReleaseParams)).wait();
            const eventStoReleased = stoReleasedReceipt.events?.find(e => e.event === 'StoReleased');
            if (!eventStoReleased?.args) {
                console.log('StoReleased イベントが発行されませんでした。');
                assert.fail();
            }
            const stoAddress = eventStoReleased.args[3];
            const stIssueParams: StIssueParams[] = [{
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                stoAddress: stoAddress,
                investor: context.accounts.aliceWallet.address,
                amount: 1000,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: NOW,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            }, {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                stoAddress: stoAddress,
                investor: context.accounts.bobWallet.address,
                amount: 1000,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: NOW,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            }, {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                stoAddress: stoAddress,
                investor: context.accounts.charlieWallet.address,
                amount: 1000,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: NOW,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            }];
            for (const stIssueParam of stIssueParams) {
                await (await stIssueContract.issue(stIssueParam)).wait();
            }

            // ST償還前の投資家数（3人）
            const stoContract = await ethers.getContractAt('ISecurityTokenOffering', stoAddress);
            const allTokenHoldersBefore = await stoContract.allTokenHolders();
            expect(allTokenHoldersBefore.length).to.equal(3);

            // ST償還パラメータ
            const stRepaymentParams: StRepaymentParams[] = [{
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                from: context.accounts.aliceWallet.address,
                amount: 100
            }, {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                from: context.accounts.bobWallet.address,
                amount: 1000
            }, {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                from: context.accounts.charlieWallet.address,
                amount: 700
            }];

            for (const stRepaymentParam of stRepaymentParams) {
                const tx = await stRepaymentContract.connect(isSPC ? accountsMap[(await stRepaymentParam.spcAddress)] : owner).repay(stRepaymentParam);
                // console.log('[tx]:', tx);

                const receipt = await tx.wait();
                // console.log('[receipt]:', receipt);

                // StRepaymentイベントを確認
                const eventStRepayed = receipt.events?.find(e => e.event === 'StRepayed');
                if (!eventStRepayed?.args) {
                    console.log('StRepayed イベントが発行されませんでした。');
                    assert.fail();
                }
                expect(eventStRepayed.args.length).to.equal(4);
                expect(eventStRepayed.args[0]._isIndexed).to.equal(true);
                expect(eventStRepayed.args[0].hash).to.equal(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(await stRepaymentParam.symbol)));
                expect(eventStRepayed.args[1]).to.equal(stRepaymentParam.spcAddress);
                expect(eventStRepayed.args[2]).to.equal(stRepaymentParam.from);
                expect(eventStRepayed.args[3]).to.equal(stRepaymentParam.amount);
            }

            // SPC単位でのTokenアドレス取得を確認
            const securityTokensArray = await context.suite.trexFactory.getSecurityTokens(spcAddress.address);
            expect(securityTokensArray.length).to.equal(1);
            expect(securityTokensArray[0]).to.not.equal(ethers.constants.AddressZero);
            const tokenContract = await ethers.getContractAt('ISTLinkToken', securityTokensArray[0]);
            expect(await tokenContract.totalSupply()).to.equal(BigNumber.from(3000 - 100 - 1000 - 700)); // 1200
            expect(await tokenContract.balanceOf(context.accounts.aliceWallet.address)).to.equal(BigNumber.from(900));
            expect(await tokenContract.balanceOf(context.accounts.bobWallet.address)).to.equal(BigNumber.from(0));
            expect(await tokenContract.balanceOf(context.accounts.charlieWallet.address)).to.equal(BigNumber.from(300));

            // STO：償還によって投資家数が減少して2人（他は不変）になることの確認
            const stos = await context.suite.stoRegistry.getStos(stReleaseParams.spcAddress, stReleaseParams.symbol);
            expect(stos.length).to.equal(1);
            expect(stos[0]).to.equal(stoAddress);

            const allTokenHoldersAfter = await stoContract.allTokenHolders();
            expect(allTokenHoldersAfter.length).to.equal(2); // 2人

            const stoValue = await stoContract.value();
            expect(stoValue.symbol).to.equal(stoReleaseParams.symbol);
            expect(stoValue.rate).to.equal(stoReleaseParams.rate);
            expect(stoValue.raisedAmount).to.equal(BigNumber.from(3000));
            expect(stoValue.soldTokensAmount).to.equal(BigNumber.from(3000));
            expect(stoValue.investorCount).to.equal(2); // 2人
            expect(stoValue.contractAddress).to.equal(stoAddress);
        }

        // [異常系] ST償還（不正な実行者:償還者のアドレス）
        it('[ERROR]repay failure(invalid executor)', async function () {
            await reset(); // 異常系テスト開始時にフリーズする事象があるため、resetで抑止する
            const { owner, spcAddress, tmpAddress, stRepaymentContract } = await loadFixture(deployContracts);
            const context = await loadFixture(deployFullSuiteFixture); // ERC3643動作環境のセットアップ

            // ST償還パラメータ
            const stRepaymentParams: StRepaymentParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                from: context.accounts.aliceWallet.address,
                amount: 500
            };

            // 異常終了確認
            try {
                await stRepaymentContract.connect(context.accounts.aliceWallet).repay(stRepaymentParams);
                assert.fail();
            } catch (error: any) {
                // errorを正常に取得できないため、手動パースする
                const iface = new Interface(["error InvalidExecutor(address)"]);
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidExecutor');
                expect(decodedError.args[0]).to.equal(context.accounts.aliceWallet.address);
            }
        });

        // [異常系] ST償還（setTrexGateway無し）
        it('[ERROR]repay failure(without setTrexGateway)', async function () {
            const { owner, spcAddress, tmpAddress, stRepaymentContract } = await loadFixture(deployContracts);
            const context = await loadFixture(deployFullSuiteFixture); // ERC3643動作環境のセットアップ
        
            // 前段のST公開：初期処理（initialize, setTrexGateway, TREXGateway#addDeployer）
            const stReleaseFactory = await ethers.getContractFactory('StRelease');
            const stReleaseContract = await stReleaseFactory.deploy();
            await stReleaseContract.deployed();
            await (await stReleaseContract.initialize()).wait();
            await (await stReleaseContract.setTrexGateway(context.suite.trexGatewayContract.address)).wait();
            await (await context.suite.trexGatewayContract.addDeployer(stReleaseContract.address)).wait();
        
            // 前段のSTO公開：初期処理（initialize, setTrexGateway）
            const stoReleaseFactory = await ethers.getContractFactory('StoRelease');
            const stoReleaseContract = await stoReleaseFactory.deploy();
            await stoReleaseContract.deployed();
            await (await stoReleaseContract.initialize()).wait();
            await (await stoReleaseContract.setTrexGateway(context.suite.trexGatewayContract.address)).wait();
        
            // 前段のST発行：初期処理（initialize）
            const stIssueFactory = await ethers.getContractFactory('StIssue');
            const stIssueContract = await stIssueFactory.deploy();
            await stIssueContract.deployed();
            await (await stIssueContract.initialize()).wait();
        
            // 初期処理（initialize） setTrexGateway無し
            await (await stRepaymentContract.initialize()).wait();

            // 事前準備
            // ST公開・STO公開・ST発行
            const stReleaseParams: StReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address
            };
            await (await stReleaseContract.release(stReleaseParams)).wait();
            const stoReleaseParams: StoReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address, rate: 1
            };
            const stoReleasedReceipt = await (await stoReleaseContract.release(stoReleaseParams)).wait();
            const eventStoReleased = stoReleasedReceipt.events?.find(e => e.event === 'StoReleased');
            if (!eventStoReleased?.args) {
                console.log('StoReleased イベントが発行されませんでした。');
                assert.fail();
            }
            const stoAddress = eventStoReleased.args[3];
            const stIssueParams: StIssueParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                stoAddress: stoAddress,
                investor: context.accounts.aliceWallet.address,
                amount: 1000,
                timeCanReceiveAfter: NEXT_WEEK,
                timeCanSendAfter: NOW,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            };
            await (await stIssueContract.issue(stIssueParams)).wait();

            // ST償還パラメータ
            const stRepaymentParams: StRepaymentParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                from: context.accounts.aliceWallet.address,
                amount: 500
            };

            // 異常終了確認
            try {
                await stRepaymentContract.repay(stRepaymentParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('InvalidTrexGatewayAddress("0x0000000000000000000000000000000000000000")');
            }
        });

        // [異常系] ST償還（過剰量の償還）
        it('[ERROR]repay failure(Excessive repayment)', async function () {
            const { owner, spcAddress, tmpAddress, stRepaymentContract, stIssueContract,
                stoReleaseContract, stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備
            // ST公開・STO公開・ST発行
            const stReleaseParams: StReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address
            };
            await (await stReleaseContract.release(stReleaseParams)).wait();
            const stoReleaseParams: StoReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address, rate: 1
            };
            const stoReleasedReceipt = await (await stoReleaseContract.release(stoReleaseParams)).wait();
            const eventStoReleased = stoReleasedReceipt.events?.find(e => e.event === 'StoReleased');
            if (!eventStoReleased?.args) {
                console.log('StoReleased イベントが発行されませんでした。');
                assert.fail();
            }
            const stoAddress = eventStoReleased.args[3];
            const stIssueParams: StIssueParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                stoAddress: stoAddress,
                investor: context.accounts.aliceWallet.address,
                amount: 1000,
                timeCanReceiveAfter: NEXT_WEEK,
                timeCanSendAfter: NOW,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            };
            await (await stIssueContract.issue(stIssueParams)).wait();

            // ST償還パラメータ
            const stRepaymentParams: StRepaymentParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                from: context.accounts.aliceWallet.address,
                amount: 1001 // 保有量超過
            };

            // 異常終了確認
            try {
                await stRepaymentContract.repay(stRepaymentParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('cannot burn more than balance');
            }
        });

        // [異常系] ST償還（第三者アドレスからの強制償還ができないこと）
        it('[ERROR]repay failure(Third-party\'s forced repayment)', async function () {
            const { owner, spcAddress, tmpAddress, stRepaymentContract, stIssueContract,
                stoReleaseContract, stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備
            // ST公開・STO公開・ST発行
            const stReleaseParams: StReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address
            };
            const stReleaseReceipt = await (await stReleaseContract.release(stReleaseParams)).wait();
            const eventStReleased = stReleaseReceipt.events?.find(e => e.event === 'StReleased');
            if (!(eventStReleased?.args)) {
                console.log('StReleased イベントが発行されませんでした。');
                assert.fail();
            }
            expect(eventStReleased.args.length).to.equal(3);
            const tokenContract = await ethers.getContractAt('IToken', eventStReleased.args[2]);

            const stoReleaseParams: StoReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address, rate: 1
            };
            const stoReleasedReceipt = await (await stoReleaseContract.release(stoReleaseParams)).wait();
            const eventStoReleased = stoReleasedReceipt.events?.find(e => e.event === 'StoReleased');
            if (!eventStoReleased?.args) {
                console.log('StoReleased イベントが発行されませんでした。');
                assert.fail();
            }
            const stoAddress = eventStoReleased.args[3];
            const stIssueParams: StIssueParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                stoAddress: stoAddress,
                investor: context.accounts.aliceWallet.address,
                amount: 1000,
                timeCanReceiveAfter: NEXT_WEEK,
                timeCanSendAfter: NOW,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            };
            await (await stIssueContract.issue(stIssueParams)).wait();

            // 異常終了確認
            // 第三者アドレス（tmpAddress）からSTO機能による強制償還
            const stoContract = await ethers.getContractAt('ISecurityTokenOffering', stoAddress);
            const aliceHolder = await stoContract.tokenHolder(context.accounts.aliceWallet.address);
            try {
                await (await stoContract.connect(tmpAddress).redeem(aliceHolder, 100)).wait();
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const iface = new Interface(["error InvalidSender(address)"]);
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }

            // 第三者アドレス（tmpAddress）からTREXの強制償還
            try {
                await tokenContract.connect(tmpAddress).burn(
                        context.accounts.aliceWallet.address, 200);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('AgentRole: caller does not have the Agent role');
            }
        });

    });
});
