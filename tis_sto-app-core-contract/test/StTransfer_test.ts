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
import type { StTransfer } from '../typechain-types/contracts/biz/StTransfer';
import type { ITokenHolder } from '../typechain-types/contracts/holder/ITokenHolder';

type StReleaseParams = StRelease.StReleaseParamsStruct;
type StoReleaseParams = StoRelease.StoReleaseParamsStruct;
type StIssueParams = StIssue.StIssueParamsStruct;
type StTransferParams = StTransfer.StTransferParamsStruct;
type TokenHolderParams = ITokenHolder.TokenHolderParamsStruct;

const TX_SUCCESS = 0x1; // receipt.statusの正常終了判定用定数
const NOW = Math.floor(Date.now() / 1000 - 60); // hardhat内の時刻ズレ対応(1分バッファ)
const YESTERDAY = NOW - 60 * 60 * 24; // 昨日
const TOMORROW = NOW + 60 * 60 * 24; // 翌日
const LAST_WEEK = NOW - 60 * 60 * 24 * 7; // 先週
const NEXT_WEEK = NOW + 60 * 60 * 24 * 7; // 来週
let accountsMap: { [key: string]: Signer } = {};

// StTransfer.solのデプロイ
async function deployContracts() {
    const [owner, spcAddress, tmpAddress] = await ethers.getSigners(); // 最大20アドレス

    const stTransferFactory = await ethers.getContractFactory('StTransfer');
    const stTransferContract = await stTransferFactory.deploy();
    await stTransferContract.deployed();

    return {
      owner,
      spcAddress,
      tmpAddress,
      stTransferContract
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
    const stTransferDeployFunction = await upgrades.deployProxy(
        (await ethers.getContractFactory('StTransfer', owner)), [], {initializer: 'initialize', kind:'uups'});
    const stTransferContract: StTransfer = await stTransferDeployFunction.connect(owner).deployed() as StTransfer;
    await (await stTransferContract.setTrexGateway(context.suite.trexGatewayContract.address)).wait();

    return {
        owner,
        spcAddress,
        tmpAddress,
        stTransferContract,
        stIssueContract,
        stoReleaseContract,
        stReleaseContract,
        context
    };
}

// ST移転テスト
describe('[StTransfer_test]', function () {

    before(async function() {
        this.timeout(10000);
        await reset();
        const { owner, spcAddress, tmpAddress, stTransferContract, stIssueContract,
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
        console.log(`   StTransferContract address: ${stTransferContract.address}`);
        console.log(`-------------------------------------------------------------------------`);
        console.log(`          aliceWallet address: ${context.accounts.aliceWallet.address}`);
        console.log(`            bobWallet address: ${context.accounts.bobWallet.address}`);
        console.log(`        charlieWallet address: ${context.accounts.charlieWallet.address}`);
        console.log(`          davidWallet address: ${context.accounts.davidWallet.address}`);
        console.log(`        anotherWallet address: ${context.accounts.anotherWallet.address}`);
        console.log(`-------------------------------------------------------------------------`);
    });

    // コントラクト初期化
    describe('StTransfer#initialize', function () {

        // [正常系] コントラクト初期化
        it('[NORMAL]initialize success', async function () {
            const { owner, spcAddress, tmpAddress, stTransferContract } = await loadFixture(deployContracts);

            // initialize を確認
            const receipt  = await (await stTransferContract.initialize()).wait();
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
            expect(await stTransferContract.paused()).to.equal(false);
            expect(await stTransferContract.owner()).to.equal(owner.address);
        });

        // [異常系] コントラクト初期化（二重実行）
        it('[ERROR]initialize failure(duplicated run)', async function () {
            const { owner, spcAddress, tmpAddress, stTransferContract } = await loadFixture(deployContracts);

            // initialize（初回）を確認
            const receipt  = await (await stTransferContract.initialize()).wait();
            expect(receipt.status).to.equal(TX_SUCCESS);

            // initialize（owner以外から実行）の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stTransferContract.connect(spcAddress).initialize({ gasLimit: 6000000 });
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
    describe('StTransfer#setTrexGateway', function () {

        // [正常系] アドレス設定
        it('[NORMAL]setTrexGateway success', async function () {
            const { owner, spcAddress, tmpAddress, stTransferContract } = await loadFixture(deployContracts);
            await (await stTransferContract.initialize()).wait();

            // setTrexGateway を確認
            expect((await (await stTransferContract.setTrexGateway(tmpAddress.address)).wait()).status).to.equal(TX_SUCCESS);
        });

        // [異常系] アドレス設定（address異常時:AddressZero）
        it('[ERROR]setTrexGateway failure(invalid address(0))', async function () {
            const { owner, spcAddress, tmpAddress, stTransferContract } = await loadFixture(deployContracts);
            await (await stTransferContract.initialize()).wait();

            // setTrexGateway address異常時の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stTransferContract.setTrexGateway(ethers.constants.AddressZero);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('InvalidTrexGatewayAddress("0x0000000000000000000000000000000000000000")');
            }
        });

        // [異常系] アドレス設定（権限エラー：owner以外から実行）
        it('[ERROR]setTrexGateway failure(not owner)', async function () {
            const { owner, spcAddress, tmpAddress, stTransferContract } = await loadFixture(deployContracts);
            await (await stTransferContract.initialize()).wait();

            // setTrexGateway（owner以外から実行）の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stTransferContract.connect(spcAddress).setTrexGateway(tmpAddress.address);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('Ownable: caller is not the owner');
            }
        });
    });

    // ST移転
    describe('StTransfer#transfer', function () {

        // [正常系] ST移転（1回）: ownerでの実行
        it('[NORMAL]transfer success from owner', async function () {
            await executeStTransferTest(false, false);
        });

        // [正常系] ST移転（1回）: SPCアドレスでの実行
        it('[NORMAL]transfer success from SPC', async function () {
            await executeStTransferTest(true, false);
        });

        // [正常系] ST移転（1回）: 投資家アドレスでの実行
        it('[NORMAL]transfer success from investor', async function () {
            await executeMultipleStTransferTest(false, true);
        });

        // [正常系] ST移転（1回）
        async function executeStTransferTest(isSPC: boolean = false, isInvestor: boolean = false) {
            const { owner, spcAddress, tmpAddress, stTransferContract, stIssueContract,
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

            // ST移転パラメータ
            const stTransferParams: StTransferParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.aliceWallet.address,
                to: context.accounts.bobWallet.address,
                amount: 500, // 移転には購入レートが掛からないため移転量:500
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: TOMORROW,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: false
            };
            const tx = await stTransferContract.connect(
                isSPC ? accountsMap[(await stTransferParams.spcAddress)] : 
                isInvestor ? accountsMap[(await stTransferParams.from)] : owner).transfer(stTransferParams);
            // console.log('[tx]:', tx);

            const receipt = await tx.wait();
            // console.log('[receipt]:', receipt);

            // StTransferイベントを確認
            const eventStTransfer = receipt.events?.find(e => e.event === 'StTransfered');
            if (!eventStTransfer?.args) {
                console.log('StTransfered イベントが発行されませんでした。');
                assert.fail();
            }

            expect(eventStTransfer.args.length).to.equal(5);
            expect(eventStTransfer.args[0]._isIndexed).to.equal(true);
            expect(eventStTransfer.args[0].hash).to.equal(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(await stTransferParams.symbol)));
            expect(eventStTransfer.args[1]).to.equal(stTransferParams.spcAddress);
            expect(eventStTransfer.args[2]).to.equal(stTransferParams.from);
            expect(eventStTransfer.args[3]).to.equal(stTransferParams.to);
            expect(eventStTransfer.args[4]).to.equal(stTransferParams.amount);

            // SPC単位でのTokenアドレス取得を確認
            const securityTokensArray = await context.suite.trexFactory.getSecurityTokens(spcAddress.address);
            expect(securityTokensArray.length).to.equal(1);
            expect(securityTokensArray[0]).to.not.equal(ethers.constants.AddressZero);
            const tokenContract = await ethers.getContractAt('ISTLinkToken', securityTokensArray[0]);
            expect(await tokenContract.totalSupply()).to.equal(BigNumber.from(stIssueParams.amount).mul(BigNumber.from(stoReleaseParams.rate))); // 2000
            expect(await tokenContract.balanceOf(context.accounts.aliceWallet.address)).to.equal(
                    BigNumber.from(stIssueParams.amount).mul(BigNumber.from(stoReleaseParams.rate)).sub(BigNumber.from(stTransferParams.amount))); // 1500
            expect(await tokenContract.balanceOf(context.accounts.bobWallet.address)).to.equal(stTransferParams.amount); // 500

            // STO単位でのトークンホルダ情報取得を確認
            expect(await context.suite.stoRegistry.getSto(stIssueParams.spcAddress, stIssueParams.symbol)).to.equal(stoAddress);
            const stoContract = await ethers.getContractAt('ISecurityTokenOffering', stoAddress);
            const allTokenHolders = await stoContract.allTokenHolders();
            expect(allTokenHolders.length).to.equal(2); // 2名
            // from側
            const tokenHolderContract0 = await ethers.getContractAt('ITokenHolder', allTokenHolders[0]);
            expect(await tokenHolderContract0.symbol()).to.equal(stIssueParams.symbol);
            expect(await tokenHolderContract0.spcAddress()).to.equal(stIssueParams.spcAddress);
            expect(await tokenHolderContract0.walletAddress()).to.equal(stIssueParams.investor);
            expect(await tokenHolderContract0.timeCanReceiveAfter()).to.equal(stIssueParams.timeCanReceiveAfter);
            expect(await tokenHolderContract0.timeCanSendAfter()).to.equal(stIssueParams.timeCanSendAfter);
            expect(await tokenHolderContract0.kycExpiry()).to.equal(stIssueParams.kycExpiry);
            expect(await tokenHolderContract0.canBuyFromSto()).to.equal(stIssueParams.canBuyFromSto);
            expect(await tokenHolderContract0.isRevoked()).to.equal(false);
            // to側
            const tokenHolderContract1 = await ethers.getContractAt('ITokenHolder', allTokenHolders[1]);
            expect(await tokenHolderContract1.symbol()).to.equal(stTransferParams.symbol);
            expect(await tokenHolderContract1.spcAddress()).to.equal(stTransferParams.spcAddress);
            expect(await tokenHolderContract1.walletAddress()).to.equal(stTransferParams.to);
            expect(await tokenHolderContract1.timeCanReceiveAfter()).to.equal(stTransferParams.timeCanReceiveAfter);
            expect(await tokenHolderContract1.timeCanSendAfter()).to.equal(stTransferParams.timeCanSendAfter);
            expect(await tokenHolderContract1.kycExpiry()).to.equal(stTransferParams.kycExpiry);
            expect(await tokenHolderContract1.canBuyFromSto()).to.equal(stTransferParams.canBuyFromSto);
            expect(await tokenHolderContract1.isRevoked()).to.equal(false);

            // Identity：初期開発としては使用しないが、利用はできる状態になっていることを空の値でassert。
            // from側
            const onchainIDAddress0 = await tokenHolderContract0.onchainId();
            expect(onchainIDAddress0).to.not.equal(ethers.constants.AddressZero);
            const identityContract0 = await ethers.getContractAt('Identity', onchainIDAddress0);
            const emptyClaim0 = await identityContract0.getClaim(ethers.utils.randomBytes(32));
            expect(emptyClaim0.topic).to.equal(BigNumber.from(0));
            expect(emptyClaim0.scheme).to.equal(BigNumber.from(0));
            expect(emptyClaim0.issuer).to.equal(ethers.constants.AddressZero);
            expect(emptyClaim0.signature).to.equal('0x');
            expect(emptyClaim0.data).to.equal('0x');
            expect(emptyClaim0.uri).to.equal('');
            // to側
            const onchainIDAddress1 = await tokenHolderContract1.onchainId();
            expect(onchainIDAddress1).to.not.equal(ethers.constants.AddressZero);
            const identityContract1 = await ethers.getContractAt('Identity', onchainIDAddress1);
            const emptyClaim1 = await identityContract1.getClaim(ethers.utils.randomBytes(32));
            expect(emptyClaim1.topic).to.equal(BigNumber.from(0));
            expect(emptyClaim1.scheme).to.equal(BigNumber.from(0));
            expect(emptyClaim1.issuer).to.equal(ethers.constants.AddressZero);
            expect(emptyClaim1.signature).to.equal('0x');
            expect(emptyClaim1.data).to.equal('0x');
            expect(emptyClaim1.uri).to.equal('');

            // STO：移転によって投資家数が2人（他は不変）になることの確認
            const stos = await context.suite.stoRegistry.getStos(stIssueParams.spcAddress, stIssueParams.symbol);
            expect(stos.length).to.equal(1);
            expect(stos[0]).to.equal(stoAddress);

            const stoValue = await stoContract.value();
            expect(stoValue.symbol).to.equal(stoReleaseParams.symbol);
            expect(stoValue.rate).to.equal(stoReleaseParams.rate);
            const expectedAmount = BigNumber.from(stIssueParams.amount).mul(BigNumber.from(stoReleaseParams.rate));
            expect(stoValue.raisedAmount).to.equal(expectedAmount);
            expect(stoValue.soldTokensAmount).to.equal(expectedAmount);
            expect(stoValue.investorCount).to.equal(2); // 2人
            expect(stoValue.contractAddress).to.equal(stoAddress);
            
            // コントラクトをV2にUpgrade（trexGateway等の設定はそのまま引き継がれるためset不要）
            const stTransferV2Factory = await ethers.getContractFactory("StTransferV2");
            const stTransferV2Contract = await upgrades.upgradeProxy(stTransferContract.address, stTransferV2Factory) as StTransfer;
            
            // 事前準備
            const stTransferParamsV2: StTransferParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.aliceWallet.address,
                to: context.accounts.bobWallet.address,
                amount: 500,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: TOMORROW,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: false
            };

            // イベントを取得できることを確認
            const txV2 = await stTransferV2Contract.connect(isSPC ? spcAddress : owner).transfer(stTransferParamsV2);
            const receiptV2 = await txV2.wait();

            // StTransferdイベントを確認
            const eventStTransferedV2 = receiptV2.events?.find(e => e.event === 'StTransferedV2');
            if (!(eventStTransferedV2?.args)) {
                console.log('StTransferedV2 イベントが発行されませんでした。');
                assert.fail();
            }
            expect(eventStTransferedV2.args.length).to.equal(6);
            expect(eventStTransferedV2.args[5]).to.equal(isSPC ? spcAddress.address : owner.address);
        }

        // [正常系] ST移転（複数回）: ownerでの実行
        it('[NORMAL]transfer success(multiple) from owner', async function () {
            await executeMultipleStTransferTest(false, false);
        });

        // [正常系] ST移転（複数回）: SPCアドレスでの実行
        it('[NORMAL]transfer success(multiple) from SPC', async function () {
            await executeMultipleStTransferTest(true, false);
        });

        // [正常系] ST移転（複数回）: 投資家アドレスでの実行
        it('[NORMAL]transfer success(multiple) from investor', async function () {
            await executeMultipleStTransferTest(false, true);
        });

        // [正常系] ST移転（複数回）
        // ＃処理順序:削除判定=>追加判定
        // ＃削除方法:末尾要素の値で、数量が0になった位置の値を上書きして、末尾要素を切り離す
        // 発行 : 1000=>A: A(1000)
        // 移転0:A=700=>B: A(300),B(700)
        // 移転1:A=300=>C: A(0),B(700) => B(700),B(700) => B(700) =>B(700),C(300)
        // 移転2:C=100=>A: B(700),C(200),A(100)
        // 移転3:B=700=>D: B(0),C(200),A(100) => A(100),C(200),A(100) => A(100),C(200) => A(100),C(200),D(700)
        async function executeMultipleStTransferTest(isSPC: boolean = false, isInvestor: boolean = false) {
            const { owner, spcAddress, tmpAddress, stTransferContract, stIssueContract,
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
                amount: 1000, // 購入レート:1 のため購入量:1000
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: NOW,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            };
            await (await stIssueContract.issue(stIssueParams)).wait();

            // ST移転パラメータ
            const stTransferParams: StTransferParams[] = [{
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.aliceWallet.address,
                to: context.accounts.bobWallet.address,
                amount: 700,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: YESTERDAY,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: false
            }, {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.aliceWallet.address,
                to: context.accounts.charlieWallet.address,
                amount: 300,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: LAST_WEEK,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: false
            }, {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: false, // 更新しない
                from: context.accounts.charlieWallet.address,
                to: context.accounts.aliceWallet.address,
                amount: 100,
                timeCanReceiveAfter: NEXT_WEEK,
                timeCanSendAfter: NEXT_WEEK,
                kycExpiry: LAST_WEEK,
                canBuyFromSto: false
            }, {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.bobWallet.address,
                to: context.accounts.davidWallet.address,
                amount: 700,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: TOMORROW,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: false
            }];

            for (const stTransferParam of stTransferParams) {
                const tx = await stTransferContract.connect(
                        isSPC ? accountsMap[(await stTransferParam.spcAddress)] :
                        isInvestor ? accountsMap[(await stTransferParam.from)] : owner).transfer(stTransferParam);
                // console.log('[tx]:', tx);

                const receipt = await tx.wait();
                // console.log('[receipt]:', receipt);

                // StTransferイベントを確認
                const eventStTransfer = receipt.events?.find(e => e.event === 'StTransfered');
                if (!eventStTransfer?.args) {
                    console.log('StTransfered イベントが発行されませんでした。');
                    assert.fail();
                }
                expect(eventStTransfer.args.length).to.equal(5);
                expect(eventStTransfer.args[0]._isIndexed).to.equal(true);
                expect(eventStTransfer.args[0].hash).to.equal(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(await stTransferParam.symbol)));
                expect(eventStTransfer.args[1]).to.equal(stTransferParam.spcAddress);
                expect(eventStTransfer.args[2]).to.equal(stTransferParam.from);
                expect(eventStTransfer.args[3]).to.equal(stTransferParam.to);
                expect(eventStTransfer.args[4]).to.equal(stTransferParam.amount);
            }

            // SPC単位でのTokenアドレス取得を確認
            const securityTokensArray = await context.suite.trexFactory.getSecurityTokens(spcAddress.address);
            expect(securityTokensArray.length).to.equal(1);
            expect(securityTokensArray[0]).to.not.equal(ethers.constants.AddressZero);
            const tokenContract = await ethers.getContractAt('ISTLinkToken', securityTokensArray[0]);
            expect(await tokenContract.totalSupply()).to.equal(BigNumber.from(stIssueParams.amount).mul(BigNumber.from(stoReleaseParams.rate))); // 2000
            expect(await tokenContract.balanceOf(context.accounts.aliceWallet.address)).to.equal(BigNumber.from(100));
            expect(await tokenContract.balanceOf(context.accounts.bobWallet.address)).to.equal(BigNumber.from(0));
            expect(await tokenContract.balanceOf(context.accounts.charlieWallet.address)).to.equal(BigNumber.from(200));
            expect(await tokenContract.balanceOf(context.accounts.davidWallet.address)).to.equal(BigNumber.from(700));

            // STO単位でのトークンホルダ情報取得を確認
            expect(await context.suite.stoRegistry.getSto(stIssueParams.spcAddress, stIssueParams.symbol)).to.equal(stoAddress);
            const stoContract = await ethers.getContractAt('ISecurityTokenOffering', stoAddress);
            const allTokenHolders = await stoContract.allTokenHolders();
            expect(allTokenHolders.length).to.equal(3); // 3名
            // Alice：「発行」の時の属性値（「移転3」は更新フラグfalse）
            const tokenHolderContract0 = await ethers.getContractAt('ITokenHolder', allTokenHolders[0]);
            expect(await tokenHolderContract0.symbol()).to.equal(stIssueParams.symbol);
            expect(await tokenHolderContract0.spcAddress()).to.equal(stIssueParams.spcAddress);
            expect(await tokenHolderContract0.walletAddress()).to.equal(stIssueParams.investor);
            expect(await tokenHolderContract0.timeCanReceiveAfter()).to.equal(stIssueParams.timeCanReceiveAfter);
            expect(await tokenHolderContract0.timeCanSendAfter()).to.equal(stIssueParams.timeCanSendAfter);
            expect(await tokenHolderContract0.kycExpiry()).to.equal(stIssueParams.kycExpiry);
            expect(await tokenHolderContract0.canBuyFromSto()).to.equal(stIssueParams.canBuyFromSto);
            expect(await tokenHolderContract0.isRevoked()).to.equal(false);
            // Charlie：「移転1」の時の属性値
            const tokenHolderContract1 = await ethers.getContractAt('ITokenHolder', allTokenHolders[1]);
            expect(await tokenHolderContract1.symbol()).to.equal(stTransferParams[1].symbol);
            expect(await tokenHolderContract1.spcAddress()).to.equal(stTransferParams[1].spcAddress);
            expect(await tokenHolderContract1.walletAddress()).to.equal(stTransferParams[1].to);
            expect(await tokenHolderContract1.timeCanReceiveAfter()).to.equal(stTransferParams[1].timeCanReceiveAfter);
            expect(await tokenHolderContract1.timeCanSendAfter()).to.equal(stTransferParams[1].timeCanSendAfter);
            expect(await tokenHolderContract1.kycExpiry()).to.equal(stTransferParams[1].kycExpiry);
            expect(await tokenHolderContract1.canBuyFromSto()).to.equal(stTransferParams[1].canBuyFromSto);
            expect(await tokenHolderContract1.isRevoked()).to.equal(false);
            // David：「移転3」の時の属性値
            const tokenHolderContract2 = await ethers.getContractAt('ITokenHolder', allTokenHolders[2]);
            expect(await tokenHolderContract2.symbol()).to.equal(stTransferParams[3].symbol);
            expect(await tokenHolderContract2.spcAddress()).to.equal(stTransferParams[3].spcAddress);
            expect(await tokenHolderContract2.walletAddress()).to.equal(stTransferParams[3].to);
            expect(await tokenHolderContract2.timeCanReceiveAfter()).to.equal(stTransferParams[3].timeCanReceiveAfter);
            expect(await tokenHolderContract2.timeCanSendAfter()).to.equal(stTransferParams[3].timeCanSendAfter);
            expect(await tokenHolderContract2.kycExpiry()).to.equal(stTransferParams[3].kycExpiry);
            expect(await tokenHolderContract2.canBuyFromSto()).to.equal(stTransferParams[3].canBuyFromSto);
            expect(await tokenHolderContract2.isRevoked()).to.equal(false);

            // STO：移転によって投資家数が3人（他は不変）になることの確認
            const stos = await context.suite.stoRegistry.getStos(stIssueParams.spcAddress, stIssueParams.symbol);
            expect(stos.length).to.equal(1);
            expect(stos[0]).to.equal(stoAddress);

            const stoValue = await stoContract.value();
            expect(stoValue.symbol).to.equal(stoReleaseParams.symbol);
            expect(stoValue.rate).to.equal(stoReleaseParams.rate);
            const expectedAmount = BigNumber.from(stIssueParams.amount).mul(BigNumber.from(stoReleaseParams.rate));
            expect(stoValue.raisedAmount).to.equal(expectedAmount);
            expect(stoValue.soldTokensAmount).to.equal(expectedAmount);
            expect(stoValue.investorCount).to.equal(3); // 3人
            expect(stoValue.contractAddress).to.equal(stoAddress);
        }

        // [正常系] ST移転（保有者アドレスからの移転 / SPCアドレスからの強制移転）
        it('[NORMAL]transfer success(private transfer / SPC\'s forced transfer)', async function () {
            const { owner, spcAddress, tmpAddress, stTransferContract, stIssueContract,
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

            // ST移転パラメータ（A =200=> B）
            const stTransferParams: StTransferParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.aliceWallet.address,
                to: context.accounts.bobWallet.address,
                amount: 200,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: TOMORROW,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: false
            };
            const receipt = await (await stTransferContract.transfer(stTransferParams)).wait();

            // StTransferイベントを確認
            const eventStTransfer = receipt.events?.find(e => e.event === 'StTransfered');
            if (!eventStTransfer?.args) {
                console.log('StTransfered イベントが発行されませんでした。');
                assert.fail();
            }

            // トークンの保有状況（STO強制移転前）A:900, B:100, SPC:0
            expect(await tokenContract.totalSupply()).to.equal(BigNumber.from(1000));
            expect(await tokenContract.balanceOf(context.accounts.aliceWallet.address)).to.equal(BigNumber.from(800));
            expect(await tokenContract.balanceOf(context.accounts.bobWallet.address)).to.equal(BigNumber.from(200));
            expect(await tokenContract.balanceOf(spcAddress.address)).to.equal(BigNumber.from(0));

            // ST移転パラメータ（A =100=> SPC）
            const stTransferParamsSPC: StTransferParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.aliceWallet.address,
                to: spcAddress.address,
                amount: 100,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: TOMORROW,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: false
            };
            await (await stTransferContract.transfer(stTransferParamsSPC)).wait();
            // await (await stTransferContract.connect(spcAddress).transfer(stTransferParamsSPC)).wait(); // TODO

            // ※注記：以下の強制取引はSTO（SecurityTokenのOffering）機能外であるため、STO情報（investorCount等）が不整合化するリスクあり
            // 　　　　また、TREXの制約としてIdentity未生成のアドレスへの強制移転は不可

            // トークンの保有状況（個別移転前）A:700, B:200, SPC:100
            expect(await tokenContract.totalSupply()).to.equal(BigNumber.from(1000));
            expect(await tokenContract.balanceOf(context.accounts.aliceWallet.address)).to.equal(BigNumber.from(700));
            expect(await tokenContract.balanceOf(context.accounts.bobWallet.address)).to.equal(BigNumber.from(200));
            expect(await tokenContract.balanceOf(context.accounts.charlieWallet.address)).to.equal(BigNumber.from(0));
            expect(await tokenContract.balanceOf(spcAddress.address)).to.equal(BigNumber.from(100));

            // トークンホルダ自身が他者へ個別に移転（A =100=> B, A =100=> SPC）
            await(await tokenContract.connect(context.accounts.aliceWallet).transfer(context.accounts.bobWallet.address, 100)).wait();
            await(await tokenContract.connect(context.accounts.aliceWallet).transfer(spcAddress.address, 100)).wait();

            // トークンの保有状況（個別移転後）A:500, B:300, SPC:200
            expect(await tokenContract.totalSupply()).to.equal(BigNumber.from(1000));
            expect(await tokenContract.balanceOf(context.accounts.aliceWallet.address)).to.equal(BigNumber.from(500));
            expect(await tokenContract.balanceOf(context.accounts.bobWallet.address)).to.equal(BigNumber.from(300));
            expect(await tokenContract.balanceOf(spcAddress.address)).to.equal(BigNumber.from(200));
            
            // SPCアドレスから強制移転（A =400=> SPC, B =300=> SPC, SPC =100=> A）
            await(await tokenContract.connect(spcAddress).forcedTransfer(
                    context.accounts.aliceWallet.address, spcAddress.address, 400)).wait();
            await(await tokenContract.connect(spcAddress).forcedTransfer(
                    context.accounts.bobWallet.address, spcAddress.address, 300)).wait();
                    await(await tokenContract.connect(spcAddress).forcedTransfer(
                        spcAddress.address, context.accounts.aliceWallet.address, 100)).wait();

            // トークンの保有状況（強制移転後）A:200, B:0, SPC:800
            expect(await tokenContract.totalSupply()).to.equal(BigNumber.from(1000));
            expect(await tokenContract.balanceOf(context.accounts.aliceWallet.address)).to.equal(BigNumber.from(200));
            expect(await tokenContract.balanceOf(context.accounts.bobWallet.address)).to.equal(BigNumber.from(0));
            expect(await tokenContract.balanceOf(spcAddress.address)).to.equal(BigNumber.from(800));
        });

        // [異常系] ST移転（不正な実行者:転送先のアドレス）
        it('[ERROR]transfer failure(invalid executor)', async function () {
            await reset(); // 異常系テスト開始時にフリーズする事象があるため、resetで抑止する
            const { owner, spcAddress, tmpAddress, stTransferContract } = await loadFixture(deployContracts);
            const context = await loadFixture(deployFullSuiteFixture); // ERC3643動作環境のセットアップ

            // ST移転パラメータ
            const stTransferParams: StTransferParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.aliceWallet.address,
                to: context.accounts.bobWallet.address,
                amount: 500,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: TOMORROW,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: false
            };

            // 異常終了確認
            try {
                await stTransferContract.connect(context.accounts.bobWallet).transfer(stTransferParams);
                assert.fail();
            } catch (error: any) {
                // errorを正常に取得できないため、手動パースする
                const iface = new Interface(["error InvalidExecutor(address)"]);
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidExecutor');
                expect(decodedError.args[0]).to.equal(context.accounts.bobWallet.address);
            }
        });

        // [異常系] ST移転（setTrexGateway無し）
        it('[ERROR]transfer failure(without setTrexGateway)', async function () {
            const { owner, spcAddress, tmpAddress, stTransferContract } = await loadFixture(deployContracts);
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
            await (await stTransferContract.initialize()).wait();

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

            // ST移転パラメータ
            const stTransferParams: StTransferParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.aliceWallet.address,
                to: context.accounts.bobWallet.address,
                amount: 500,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: TOMORROW,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: false
            };

            // 異常終了確認
            try {
                await stTransferContract.transfer(stTransferParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('InvalidTrexGatewayAddress("0x0000000000000000000000000000000000000000")');
            }
        });

        // [異常系] ST移転（送信可能日時未到達）
        it('[ERROR]transfer failure(sendable time unachieved)', async function () {
            const { owner, spcAddress, tmpAddress, stTransferContract, stIssueContract,
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
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: TOMORROW, // 送信可能日時が翌日
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: true
            };
            await (await stIssueContract.issue(stIssueParams)).wait();

            // ST移転パラメータ
            const stTransferParams: StTransferParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.aliceWallet.address,
                to: context.accounts.bobWallet.address,
                amount: 500,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: NOW,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: false
            };

            // 異常終了確認
            try {
                await stTransferContract.transfer(stTransferParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('InvestorStillUnableToSend');
            }
        });

        // [異常系] ST移転（受信可能日時未到達）
        it('[ERROR]transfer failure(receivable time unachieved)', async function () {
            const { owner, spcAddress, tmpAddress, stTransferContract, stIssueContract,
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
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: NOW,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: true
            };
            await (await stIssueContract.issue(stIssueParams)).wait();

            // ST移転パラメータ
            const stTransferParams: StTransferParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.aliceWallet.address,
                to: context.accounts.bobWallet.address,
                amount: 500,
                timeCanReceiveAfter: NEXT_WEEK, // 送信可能日時が翌週
                timeCanSendAfter: NOW,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: false
            };

            // 異常終了確認
            try {
                await stTransferContract.transfer(stTransferParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('InvestorStillUnableToReceive');
            }
        });

        // [異常系] ST移転（KYC有効期限切れ）
        it('[ERROR]transfer failure(KYC expired)', async function () {
            const { owner, spcAddress, tmpAddress, stTransferContract, stIssueContract,
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
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: NOW,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: true
            };
            await (await stIssueContract.issue(stIssueParams)).wait();

            // ST移転パラメータ
            const stTransferParams: StTransferParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.aliceWallet.address,
                to: context.accounts.bobWallet.address,
                amount: 500,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: NOW,
                kycExpiry: NOW, // 期限が直前
                canBuyFromSto: false
            };

            // 異常終了確認
            try {
                await stTransferContract.transfer(stTransferParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('InvestorKycExpired');
                expect(error.message).to.include('toHolder');
            }
        });

        // [異常系] ST移転（過剰量の移転）
        it('[ERROR]transfer failure(Excessive transfer)', async function () {
            const { owner, spcAddress, tmpAddress, stTransferContract, stIssueContract,
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

            // ST移転パラメータ
            const stTransferParams: StTransferParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.aliceWallet.address,
                to: context.accounts.bobWallet.address,
                amount: 1001, // 保有量超過
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: TOMORROW,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: false
            };

            // 異常終了確認
            try {
                await stTransferContract.transfer(stTransferParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('Insufficient Balance');
            }
        });

        // [異常系] ST移転（過剰量の保有者アドレスからの移転 / SPCアドレスからの強制移転）
        it('[ERROR]transfer failure(Excessive private transfer / SPC\'s forced transfer)', async function () {
            const { owner, spcAddress, tmpAddress, stTransferContract, stIssueContract,
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

            // ST移転パラメータ
            const stTransferParams: StTransferParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.aliceWallet.address,
                to: context.accounts.bobWallet.address,
                amount: 300,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: TOMORROW,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: false
            };
            const tx = await stTransferContract.transfer(stTransferParams);
            // console.log('[tx]:', tx);

            const receipt = await tx.wait();
            // console.log('[receipt]:', receipt);

            // StTransferイベントを確認
            const eventStTransfer = receipt.events?.find(e => e.event === 'StTransfered');
            if (!eventStTransfer?.args) {
                console.log('StTransfered イベントが発行されませんでした。');
                assert.fail();
            }

            // トークンの保有状況（移転前）A:700, B:300, SPC:0
            expect(await tokenContract.totalSupply()).to.equal(BigNumber.from(1000));
            expect(await tokenContract.balanceOf(context.accounts.aliceWallet.address)).to.equal(BigNumber.from(700));
            expect(await tokenContract.balanceOf(context.accounts.bobWallet.address)).to.equal(BigNumber.from(300));
            expect(await tokenContract.balanceOf(spcAddress.address)).to.equal(BigNumber.from(0));

            // 異常終了確認
            // トークンホルダが保有量を超過して他者へ個別に移転（A =701=> B）
            try {
                await tokenContract.connect(context.accounts.aliceWallet).transfer(context.accounts.bobWallet.address, 701);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('Insufficient Balance');
            }

            // SPCアドレスから保有量を超過して強制移転（B =400=> SPC）
            try {
                await tokenContract.connect(spcAddress).forcedTransfer(
                        context.accounts.bobWallet.address, spcAddress.address, 400);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('sender balance too low');
            }
        });

        // [異常系] ST移転（第三者アドレスからの強制移転ができないこと）
        it('[ERROR]transfer failure(Third-party\'s forced transfer)', async function () {
            const { owner, spcAddress, tmpAddress, stTransferContract, stIssueContract,
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

            // ST移転パラメータ
            const stTransferParams: StTransferParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.aliceWallet.address,
                to: context.accounts.bobWallet.address,
                amount: 300,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: TOMORROW,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: false
            };
            const tx = await stTransferContract.transfer(stTransferParams);
            // console.log('[tx]:', tx);

            const receipt = await tx.wait();
            // console.log('[receipt]:', receipt);

            // StTransferイベントを確認
            const eventStTransfer = receipt.events?.find(e => e.event === 'StTransfered');
            if (!eventStTransfer?.args) {
                console.log('StTransfered イベントが発行されませんでした。');
                assert.fail();
            }

            // 異常終了確認
            const stoContract = await ethers.getContractAt('ISecurityTokenOffering', stoAddress);
            const aliceHolder = await stoContract.tokenHolder(context.accounts.aliceWallet.address);
            const bobHolder = await stoContract.tokenHolder(context.accounts.bobWallet.address);
            const iface = new Interface(["error InvalidSender(address)"]);

            // deployerアドレス（owner）からSTO機能による強制移転（ownerであっても業務コントラクト以外からの直アクセスは制限されること）
            try {
                await (await stoContract.connect(tmpAddress).forcedTransfer(aliceHolder, bobHolder, 100)).wait();
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }

            // 権限の無い第三者アドレス（tmpAddress）からSTO機能による強制移転
            try {
                await (await stoContract.connect(tmpAddress).forcedTransfer(aliceHolder, bobHolder, 100)).wait();
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }

            // deployerアドレス（owner）からTREXの強制移転
            try {
                await tokenContract.connect(owner).forcedTransfer(
                        context.accounts.aliceWallet.address, spcAddress.address, 400);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('AgentRole: caller does not have the Agent role');
            }

            // 権限の無い第三者アドレス（tmpAddress）からTREXの強制移転
            try {
                await tokenContract.connect(tmpAddress).forcedTransfer(
                        context.accounts.aliceWallet.address, spcAddress.address, 400);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('AgentRole: caller does not have the Agent role');
            }
        });

        // [異常系] ST移転（SPCアドレスからの強制移転以外のトークン操作）
        it('[ERROR]transfer failure(SPC\'s token operations other than forced transfers)', async function () {
            const { owner, spcAddress, tmpAddress, stTransferContract, stIssueContract,
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

            // ST移転パラメータ
            const stTransferParams: StTransferParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                from: context.accounts.aliceWallet.address,
                to: context.accounts.bobWallet.address,
                amount: 300,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: TOMORROW,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: false
            };
            const tx = await stTransferContract.transfer(stTransferParams);
            // console.log('[tx]:', tx);

            const receipt = await tx.wait();
            // console.log('[receipt]:', receipt);

            // StTransferイベントを確認
            const eventStTransfer = receipt.events?.find(e => e.event === 'StTransfered');
            if (!eventStTransfer?.args) {
                console.log('StTransfered イベントが発行されませんでした。');
                assert.fail();
            }

            // 異常終了確認
            const stoContract = await ethers.getContractAt('ISecurityTokenOffering', stoAddress);
            const aliceHolder = await stoContract.tokenHolder(context.accounts.aliceWallet.address);
            const bobHolder = await stoContract.tokenHolder(context.accounts.bobWallet.address);

            const tokenHolderParam: TokenHolderParams = {
                symbol: stTransferParams.symbol,
                spcAddress: stTransferParams.spcAddress,
                walletAddress: stTransferParams.to,
                timeCanReceiveAfter: stTransferParams.timeCanReceiveAfter,
                timeCanSendAfter: stTransferParams.timeCanSendAfter,
                kycExpiry: stTransferParams.kycExpiry,
                canBuyFromSto: stTransferParams.canBuyFromSto
            };

            // SPCアドレスからのトークンホルダ情報の追加/更新
            const iface = new Interface(["error InvalidSender(address)"]);
            try {
                await (await stoContract.connect(spcAddress).modifyTokenHolder(tokenHolderParam)).wait();
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }
            // SPCアドレスからのセキュリティトークン購入
            try {
                await (await stoContract.connect(spcAddress).purchase(stTransferParams.from, stTransferParams.amount)).wait();
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }
            // SPCアドレスからの強制でないセキュリティトークン移転
            try {
                await (await stoContract.connect(spcAddress).transfer(bobHolder, aliceHolder, 301)).wait();
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }
            // SPCアドレスからのセキュリティトークン償還
            try {
                await (await stoContract.connect(spcAddress).redeem(stTransferParams.from, stTransferParams.amount)).wait();
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }

            // deployerアドレス（owner）からのトークンホルダ情報の追加/更新
            try {
                await (await stoContract.modifyTokenHolder(tokenHolderParam)).wait();
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }
            // deployerアドレス（owner）からのセキュリティトークン購入
            try {
                await (await stoContract.purchase(stTransferParams.from, stTransferParams.amount)).wait();
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }
            // deployerアドレス（owner）からの強制でないセキュリティトークン移転
            try {
                await (await stoContract.transfer(bobHolder, aliceHolder, 301)).wait();
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }
            // deployerアドレス（owner）からのセキュリティトークン償還
            try {
                await (await stoContract.redeem(stTransferParams.from, stTransferParams.amount)).wait();
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }

            // 権限の無い第三者アドレス（tmpAddress）からのトークンホルダ情報の追加/更新
            try {
                await (await stoContract.connect(tmpAddress).modifyTokenHolder(tokenHolderParam)).wait();
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }
            // 権限の無い第三者アドレス（tmpAddress）からのセキュリティトークン購入
            try {
                await (await stoContract.connect(tmpAddress).purchase(stTransferParams.from, stTransferParams.amount)).wait();
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }
            // 権限の無い第三者アドレス（tmpAddress）からの強制でないセキュリティトークン移転
            try {
                await (await stoContract.connect(tmpAddress).transfer(bobHolder, aliceHolder, 301)).wait();
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }
            // 権限の無い第三者アドレス（tmpAddress）からのセキュリティトークン償還
            try {
                await (await stoContract.connect(tmpAddress).redeem(stTransferParams.from, stTransferParams.amount)).wait();
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }

        });

    });
});
