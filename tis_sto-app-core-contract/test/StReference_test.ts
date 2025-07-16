import '@nomiclabs/hardhat-ethers';
import { BigNumber } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect, assert } from 'chai';
import { loadFixture, reset } from '@nomicfoundation/hardhat-network-helpers';

// import * from '../typechain-types/@tokenysolutions/t-rex/contracts/factory/ITREXGateway';
import { deployFullSuiteFixture } from './fixtures/deploy-full-suite.fixture';
import type { StRelease } from '../typechain-types/contracts/biz/StRelease';
import type { StoRelease } from '../typechain-types/contracts/biz/StoRelease';
import type { StIssue } from '../typechain-types/contracts/biz/StIssue';
import type { StRepayment } from '../typechain-types/contracts/biz/StRepayment';
import type { StTransfer } from '../typechain-types/contracts/biz/StTransfer';
import type { StReference } from '../typechain-types/contracts/biz/StReference';
import type { ISecurityTokenOffering } from '../typechain-types/contracts/sto/ISecurityTokenOffering';


type StReleaseParams = StRelease.StReleaseParamsStruct;
type StoReleaseParams = StoRelease.StoReleaseParamsStruct;
type StIssueParams = StIssue.StIssueParamsStruct;
type StRepaymentParams = StRepayment.StRepaymentParamsStruct;
type StTransferParams = StTransfer.StTransferParamsStruct;
type SecurityTokenAttributes = StReference.TokenHolderAttributesStruct;
type TokenHolderAttributes = StReference.TokenHolderAttributesStruct;
type StoAttributes = ISecurityTokenOffering.StoAttributesStruct;

const TX_SUCCESS = 0x1; // receipt.statusの正常終了判定用定数
const NOW = Math.floor(Date.now() / 1000 - 60); // hardhat内の時刻ズレ対応(1分バッファ)
const YESTERDAY = NOW - 60 * 60 * 24; // 昨日
const TOMORROW = NOW + 60 * 60 * 24; // 翌日
const LAST_WEEK = NOW - 60 * 60 * 24 * 7; // 先週
const NEXT_WEEK = NOW + 60 * 60 * 24 * 7; // 来週

// StReference.solのデプロイ
async function deployContracts() {
    const [owner, spcAddress, tmpAddress] = await ethers.getSigners(); // 最大20アドレス

    const stReferenceFactory = await ethers.getContractFactory('StReference');
    const stReferenceContract = await stReferenceFactory.deploy();
    await stReferenceContract.deployed();

    return {
      owner,
      spcAddress,
      tmpAddress,
      stReferenceContract
    };
}

// ERC3643動作環境のセットアップ＋StoRelease.solのセットアップ（デプロイ＋初期処理）
async function setupContracts() {
    const [owner, spcAddress, tmpAddress] = await ethers.getSigners();
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

    // 前段のST移転：初期処理（initialize, setTrexGateway）
    const stTransferFactory = await ethers.getContractFactory('StTransfer');
    const stTransferContract = await stTransferFactory.deploy();
    await stTransferContract.deployed();
    await (await stTransferContract.initialize()).wait();
    await (await stTransferContract.setTrexGateway(context.suite.trexGatewayContract.address)).wait();

    // 前段のST償還：初期処理（initialize, setTrexGateway）
    const stRepaymentFactory = await ethers.getContractFactory('StRepayment');
    const stRepaymentContract = await stRepaymentFactory.deploy();
    await stRepaymentContract.deployed();
    await (await stRepaymentContract.initialize()).wait();
    await (await stRepaymentContract.setTrexGateway(context.suite.trexGatewayContract.address)).wait();

    // 初期処理（initialize, setTrexGateway）
    const stReferenceDeployFunction = await upgrades.deployProxy(
        (await ethers.getContractFactory('StReference', owner)), [], {initializer: 'initialize', kind:'uups'});
    const stReferenceContract: StReference = await stReferenceDeployFunction.connect(owner).deployed() as StReference;
    await (await stReferenceContract.setTrexGateway(context.suite.trexGatewayContract.address)).wait();

    return {
        owner,
        spcAddress,
        tmpAddress,
        stReferenceContract,
        stRepaymentContract,
        stTransferContract,
        stIssueContract,
        stoReleaseContract,
        stReleaseContract,
        context
    };
}

// ST関連情報参照テスト
describe('[StReference_test]', function () {

    before(async function() {
        await reset();
        const { owner, spcAddress, tmpAddress, stReferenceContract, stRepaymentContract,
            stTransferContract, stIssueContract, stoReleaseContract, stReleaseContract,
            context } = await loadFixture(setupContracts);

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
        console.log(`  StRepaymentContract address: ${stRepaymentContract.address}`);
        console.log(`  StReferenceContract address: ${stReferenceContract.address}`);
        console.log(`-------------------------------------------------------------------------`);
        console.log(`          aliceWallet address: ${context.accounts.aliceWallet.address}`);
        console.log(`            bobWallet address: ${context.accounts.bobWallet.address}`);
        console.log(`        charlieWallet address: ${context.accounts.charlieWallet.address}`);
        console.log(`          davidWallet address: ${context.accounts.davidWallet.address}`);
        console.log(`        anotherWallet address: ${context.accounts.anotherWallet.address}`);
        console.log(`-------------------------------------------------------------------------`);
    });

    // コントラクト初期化
    describe('StReference#initialize', function () {

        // [正常系] コントラクト初期化
        it('[NORMAL]initialize success', async function () {
            const { owner, spcAddress, tmpAddress, stReferenceContract } = await loadFixture(deployContracts);

            // initialize を確認
            const receipt  = await (await stReferenceContract.initialize()).wait();
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
            expect(await stReferenceContract.paused()).to.equal(false);
            expect(await stReferenceContract.owner()).to.equal(owner.address);
        });

        // [異常系] コントラクト初期化（二重実行）
        it('[ERROR]initialize failure(duplicated run)', async function () {
            const { owner, spcAddress, tmpAddress, stReferenceContract } = await loadFixture(deployContracts);

            // initialize（初回）を確認
            const receipt  = await (await stReferenceContract.initialize()).wait();
            expect(receipt.status).to.equal(TX_SUCCESS);

            // initialize（owner以外から実行）の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stReferenceContract.connect(spcAddress).initialize(); // TODO:{ gasLimit: 6000000 }
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
    describe('StReference#setTrexGateway', function () {

        // [正常系] アドレス設定
        it('[NORMAL]setTrexGateway success', async function () {
            const { owner, spcAddress, tmpAddress, stReferenceContract } = await loadFixture(deployContracts);
            await (await stReferenceContract.initialize()).wait();

            // setTrexGateway を確認
            expect((await (await stReferenceContract.setTrexGateway(tmpAddress.address)).wait()).status).to.equal(TX_SUCCESS);
        });

        // [異常系] アドレス設定（address異常時:AddressZero）
        it('[ERROR]setTrexGateway failure(invalid address(0))', async function () {
            const { owner, spcAddress, tmpAddress, stReferenceContract } = await loadFixture(deployContracts);
            await (await stReferenceContract.initialize()).wait();

            // setTrexGateway address異常時の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stReferenceContract.setTrexGateway(ethers.constants.AddressZero);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('InvalidTrexGatewayAddress("0x0000000000000000000000000000000000000000")');
            }
        });

        // [異常系] アドレス設定（権限エラー：owner以外から実行）
        it('[ERROR]setTrexGateway failure(not owner)', async function () {
            const { owner, spcAddress, tmpAddress, stReferenceContract } = await loadFixture(deployContracts);
            await (await stReferenceContract.initialize()).wait();

            // setTrexGateway（owner以外から実行）の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stReferenceContract.connect(spcAddress).setTrexGateway(tmpAddress.address);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('Ownable: caller is not the owner');
            }
        });
    });

    // STリスト取得
    describe('StReference#getSecurityTokens', function () {

        // [正常系] STリスト取得
        it('[NORMAL]getSecurityTokens success', async function () {
            const { owner, spcAddress, tmpAddress, stReferenceContract, stRepaymentContract,
                stTransferContract, stIssueContract, stoReleaseContract, stReleaseContract,
                context } = await loadFixture(setupContracts);
            
            // STリストなし
            const resultZero = await stReferenceContract.getSecurityTokens(spcAddress.address);
            expect(resultZero.length).to.equal(0);

            // STリスト単数
            const stReleaseParamsOne: StReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address
            };
            const stReleaseReceiptOne = await (await stReleaseContract.release(stReleaseParamsOne)).wait();
            const eventStReleaseOne = stReleaseReceiptOne.events?.find(e => e.event === 'StReleased');
            if (!eventStReleaseOne?.args) {
                console.log('StReleased イベントが発行されませんでした。');
                assert.fail();
            }

            const resultOne = await stReferenceContract.getSecurityTokens(spcAddress.address);
            expect(resultOne.length).to.equal(1);
            expect(resultOne[0].symbol).to.equal('TEST_SYMBOL');
            expect(resultOne[0].contractAddr).to.equal(eventStReleaseOne.args[2]);
            expect(resultOne[0].totalSupply).to.equal(0);
            expect(resultOne[0].treasuryWallet).to.equal(spcAddress.address);
            expect(resultOne[0].frozen).to.equal(false);  // bool初期値
            expect(resultOne[0].allowed).to.equal(false); // bool初期値

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

            const resultIssued = await stReferenceContract.getSecurityTokens(spcAddress.address);
            expect(resultIssued.length).to.equal(1);
            expect(resultIssued[0].symbol).to.equal('TEST_SYMBOL');
            expect(resultIssued[0].contractAddr).to.equal(eventStReleaseOne.args[2]);
            expect(resultIssued[0].totalSupply).to.equal(1000); // トークン発行が総提供量に反映されること
            expect(resultIssued[0].treasuryWallet).to.equal(spcAddress.address);
            expect(resultIssued[0].frozen).to.equal(false); // 初期化後:ST移転凍結なし
            expect(resultIssued[0].allowed).to.equal(true); // 初期化後:ST発行凍結なし（許可状態）

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
            await (await stTransferContract.transfer(stTransferParams)).wait();

            const resultTransfered = await stReferenceContract.getSecurityTokens(spcAddress.address);
            expect(resultTransfered.length).to.equal(1);
            expect(resultTransfered[0].symbol).to.equal('TEST_SYMBOL');
            expect(resultTransfered[0].contractAddr).to.equal(eventStReleaseOne.args[2]);
            expect(resultTransfered[0].totalSupply).to.equal(1000); // 移転されても総提供量は増減しないこと
            expect(resultTransfered[0].treasuryWallet).to.equal(spcAddress.address);
            expect(resultTransfered[0].frozen).to.equal(false);
            expect(resultTransfered[0].allowed).to.equal(true);

            // ST償還パラメータ
            const stRepaymentParams: StRepaymentParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                from: context.accounts.aliceWallet.address,
                amount: 500
            };
            await (await stRepaymentContract.repay(stRepaymentParams)).wait();

            const resultSecurityTokens = await stReferenceContract.getSecurityTokens(spcAddress.address);
            expect(resultSecurityTokens.length).to.equal(1);
            expect(resultSecurityTokens[0].symbol).to.equal('TEST_SYMBOL');
            expect(resultSecurityTokens[0].contractAddr).to.equal(eventStReleaseOne.args[2]);
            expect(resultSecurityTokens[0].totalSupply).to.equal(500); // 償還によって総提供量が減少すること
            expect(resultSecurityTokens[0].treasuryWallet).to.equal(spcAddress.address);
            expect(resultSecurityTokens[0].frozen).to.equal(false);
            expect(resultSecurityTokens[0].allowed).to.equal(true);

            // STリスト複数
            // ST公開2回目
            const stReleaseParams2: StReleaseParams = {
                symbol: 'TEST_SYMBOL_2', spcAddress: spcAddress.address
            };
            const stReleaseReceipt2 = await (await stReleaseContract.release(stReleaseParams2)).wait();
            const eventStRelease2 = stReleaseReceipt2.events?.find(e => e.event === 'StReleased');
            if (!eventStRelease2?.args) {
                console.log('StReleased イベントが発行されませんでした。');
                assert.fail();
            }
            const stReleaseParams3: StReleaseParams = {
                symbol: 'TEST_SYMBOL_3', spcAddress: spcAddress.address
            };

            // ST公開（別のSPCアドレス：tmpAddress）
            const stReleaseParamsOther: StReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: tmpAddress.address
            };
            const stReleaseReceiptOther = await (await stReleaseContract.release(stReleaseParamsOther)).wait();
            const eventStReleaseOther = stReleaseReceiptOther.events?.find(e => e.event === 'StReleased');
            if (!eventStReleaseOther?.args) {
                console.log('StReleased イベントが発行されませんでした。');
                assert.fail();
            }

            // ST公開3回目
            const stReleaseReceipt3 = await (await stReleaseContract.release(stReleaseParams3)).wait();
            const eventStRelease3 = stReleaseReceipt3.events?.find(e => e.event === 'StReleased');
            if (!eventStRelease3?.args) {
                console.log('StReleased イベントが発行されませんでした。');
                assert.fail();
            }

            const resultMulti = await stReferenceContract.getSecurityTokens(spcAddress.address);
            expect(resultMulti.length).to.equal(3);
            // 1回目のST公開分は償還直後の状態と同一
            expect(resultMulti[0].symbol).to.equal('TEST_SYMBOL');
            expect(resultMulti[0].contractAddr).to.equal(eventStReleaseOne.args[2]);
            expect(resultMulti[0].totalSupply).to.equal(500);
            expect(resultMulti[0].treasuryWallet).to.equal(spcAddress.address);
            expect(resultMulti[0].frozen).to.equal(false);
            expect(resultMulti[0].allowed).to.equal(true);

            expect(resultMulti[1].symbol).to.equal('TEST_SYMBOL_2');
            expect(resultMulti[1].contractAddr).to.equal(eventStRelease2.args[2]);
            expect(resultMulti[1].totalSupply).to.equal(0);
            expect(resultMulti[1].treasuryWallet).to.equal(spcAddress.address);
            expect(resultMulti[1].frozen).to.equal(false);  // bool初期値
            expect(resultMulti[1].allowed).to.equal(false); // bool初期値

            expect(resultMulti[2].symbol).to.equal('TEST_SYMBOL_3');
            expect(resultMulti[2].contractAddr).to.equal(eventStRelease3.args[2]);
            expect(resultMulti[2].totalSupply).to.equal(0);
            expect(resultMulti[2].treasuryWallet).to.equal(spcAddress.address);
            expect(resultMulti[2].frozen).to.equal(false);  // bool初期値
            expect(resultMulti[2].allowed).to.equal(false); // bool初期値
            
            // 別のSPCアドレス（tmpAddress）は単数で取得されること
            const resultOther = await stReferenceContract.getSecurityTokens(tmpAddress.address);
            expect(resultOther.length).to.equal(1);
            expect(resultOther[0].symbol).to.equal('TEST_SYMBOL');
            expect(resultOther[0].contractAddr).to.equal(eventStReleaseOther.args[2]);
            expect(resultOther[0].totalSupply).to.equal(0);
            expect(resultOther[0].treasuryWallet).to.equal(tmpAddress.address);
            expect(resultOther[0].frozen).to.equal(false);  // bool初期値
            expect(resultOther[0].allowed).to.equal(false); // bool初期値


            // コントラクトをV2にUpgrade（trexGateway等の設定はそのまま引き継がれるためset不要）
            const stReferenceV2Factory = await ethers.getContractFactory("StReferenceV2");
            const stReferenceV2Contract = await upgrades.upgradeProxy(stReferenceContract.address, stReferenceV2Factory) as StReference;
            
            const resultMultiV2 = await stReferenceV2Contract.getSecurityTokens(spcAddress.address);
            expect(resultMultiV2.length).to.equal(4);
        });
    });

    // 保有者リスト取得
    describe('StReference#getTokenHolders', function () {

        // [正常系] 保有者リスト取得
        it('[NORMAL]getTokenHolders success', async function () {
            const { owner, spcAddress, tmpAddress, stReferenceContract, stRepaymentContract,
                stTransferContract, stIssueContract, stoReleaseContract, stReleaseContract,
                context } = await loadFixture(setupContracts);
            
            // 保有者リストなし
            const resultZero = await stReferenceContract.getTokenHolders('TEST_SYMBOL', spcAddress.address);
            expect(resultZero.length).to.equal(0);

            // 保有者リストあり
            const stReleaseParamsOne: StReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address
            };
            const stReleaseReceiptOne = await (await stReleaseContract.release(stReleaseParamsOne)).wait();
            const eventStReleaseOne = stReleaseReceiptOne.events?.find(e => e.event === 'StReleased');
            if (!eventStReleaseOne?.args) {
                console.log('StReleased イベントが発行されませんでした。');
                assert.fail();
            }

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

            const resultOne = await stReferenceContract.getTokenHolders('TEST_SYMBOL', spcAddress.address);
            expect(resultOne.length).to.equal(1);
            expect(resultOne[0].balance).to.equal(stIssueParams.amount);
            expect(resultOne[0].walletAddress).to.equal(stIssueParams.investor);
            expect(resultOne[0].canBuyFromSto).to.equal(stIssueParams.canBuyFromSto);
            expect(resultOne[0].canSendAfter).to.equal(stIssueParams.timeCanSendAfter);
            expect(resultOne[0].canReceiveAfter).to.equal(stIssueParams.timeCanReceiveAfter);
            expect(resultOne[0].kycExpiry).to.equal(stIssueParams.kycExpiry);
            expect(resultOne[0].isRevoked).to.equal(false);

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
            await (await stTransferContract.transfer(stTransferParams)).wait();

            const resultTransfered = await stReferenceContract.getTokenHolders('TEST_SYMBOL', spcAddress.address);
            expect(resultTransfered.length).to.equal(2);
            // 移転元（Alice）は、balanceが減少し、それ以外はIssue時から変更なし
            expect(resultTransfered[0].balance).to.equal(BigNumber.from(stIssueParams.amount).sub(BigNumber.from(stTransferParams.amount)));
            expect(resultTransfered[0].walletAddress).to.equal(stIssueParams.investor);
            expect(resultTransfered[0].canBuyFromSto).to.equal(stIssueParams.canBuyFromSto);
            expect(resultTransfered[0].canSendAfter).to.equal(stIssueParams.timeCanSendAfter);
            expect(resultTransfered[0].canReceiveAfter).to.equal(stIssueParams.timeCanReceiveAfter);
            expect(resultTransfered[0].kycExpiry).to.equal(stIssueParams.kycExpiry);
            expect(resultTransfered[0].isRevoked).to.equal(false);

            // 移転先（Bob）は、StTransferParamsの内容そのまま
            expect(resultTransfered[1].balance).to.equal(stTransferParams.amount);
            expect(resultTransfered[1].walletAddress).to.equal(stTransferParams.to);
            expect(resultTransfered[1].canBuyFromSto).to.equal(stTransferParams.canBuyFromSto);
            expect(resultTransfered[1].canSendAfter).to.equal(stTransferParams.timeCanSendAfter);
            expect(resultTransfered[1].canReceiveAfter).to.equal(stTransferParams.timeCanReceiveAfter);
            expect(resultTransfered[1].kycExpiry).to.equal(stTransferParams.kycExpiry);
            expect(resultTransfered[1].isRevoked).to.equal(false);

            // ST償還パラメータ（Aliceから全額、Bobから半額償還）
            const stRepaymentParamsAlice: StRepaymentParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                from: context.accounts.aliceWallet.address,
                amount: 500
            };
            await (await stRepaymentContract.repay(stRepaymentParamsAlice)).wait();
            const stRepaymentParamsBob: StRepaymentParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                from: context.accounts.bobWallet.address,
                amount: 250
            };
            await (await stRepaymentContract.repay(stRepaymentParamsBob)).wait();

            const resultTokenHolders = await stReferenceContract.getTokenHolders('TEST_SYMBOL', spcAddress.address);
            expect(resultTokenHolders.length).to.equal(1);
            // Aliceは、balanceが0になり、取得対象外

            // Bobは、balanceが半分になり、それ以外はStTransferParamsの内容そのまま
            expect(resultTokenHolders[0].balance).to.equal(BigNumber.from(stTransferParams.amount).div(2));
            expect(resultTokenHolders[0].walletAddress).to.equal(stTransferParams.to);
            expect(resultTokenHolders[0].canBuyFromSto).to.equal(stTransferParams.canBuyFromSto);
            expect(resultTokenHolders[0].canSendAfter).to.equal(stTransferParams.timeCanSendAfter);
            expect(resultTokenHolders[0].canReceiveAfter).to.equal(stTransferParams.timeCanReceiveAfter);
            expect(resultTokenHolders[0].kycExpiry).to.equal(stTransferParams.kycExpiry);
            expect(resultTokenHolders[0].isRevoked).to.equal(false);
            // TODO:保有者リスト取得
            

            // コントラクトをV2にUpgrade（trexGateway等の設定はそのまま引き継がれるためset不要）
            const stReferenceV2Factory = await ethers.getContractFactory("StReferenceV2");
            const stReferenceV2Contract = await upgrades.upgradeProxy(stReferenceContract.address, stReferenceV2Factory) as StReference;
            
            const resultTokenHoldersV2 = await stReferenceV2Contract.getTokenHolders('TEST_SYMBOL', spcAddress.address);
            expect(resultTokenHoldersV2.length).to.equal(2);
        });
    });

    // STOリスト取得
    describe('StReference#getStos', function () {

        // [正常系] STOリスト取得
        it('[NORMAL]getStos success', async function () {
            const { owner, spcAddress, tmpAddress, stReferenceContract, stRepaymentContract,
                stTransferContract, stIssueContract, stoReleaseContract, stReleaseContract,
                context } = await loadFixture(setupContracts);
            
            // STOリストなし
            const resultZero = await stReferenceContract.getStos('TEST_SYMBOL', spcAddress.address);
            expect(resultZero.length).to.equal(0);

            // STOリスト単数
            const stReleaseParamsOne: StReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address
            };
            const stReleaseReceiptOne = await (await stReleaseContract.release(stReleaseParamsOne)).wait();
            const eventStReleaseOne = stReleaseReceiptOne.events?.find(e => e.event === 'StReleased');
            if (!eventStReleaseOne?.args) {
                console.log('StReleased イベントが発行されませんでした。');
                assert.fail();
            }

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

            const resultOne = await stReferenceContract.getStos('TEST_SYMBOL', spcAddress.address);
            expect(resultOne.length).to.equal(1);
            expect(resultOne[0].symbol).to.equal(stoReleaseParams.symbol);
            expect(resultOne[0].rate).to.equal(stoReleaseParams.rate);
            expect(resultOne[0].raisedAmount).to.equal(0);
            expect(resultOne[0].soldTokensAmount).to.equal(0);
            expect(resultOne[0].investorCount).to.equal(0);
            expect(resultOne[0].contractAddress).to.equal(stoAddress);

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

            const resultOneIssued = await stReferenceContract.getStos('TEST_SYMBOL', spcAddress.address);
            expect(resultOneIssued.length).to.equal(1);
            expect(resultOneIssued[0].symbol).to.equal(stoReleaseParams.symbol);
            expect(resultOneIssued[0].rate).to.equal(stoReleaseParams.rate);
            expect(resultOneIssued[0].raisedAmount).to.equal(stIssueParams.amount);
            expect(resultOneIssued[0].soldTokensAmount).to.equal(stIssueParams.amount);
            expect(resultOneIssued[0].investorCount).to.equal(1);
            expect(resultOneIssued[0].contractAddress).to.equal(stoAddress);

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
            await (await stTransferContract.transfer(stTransferParams)).wait();

            const resultTransfered = await stReferenceContract.getStos('TEST_SYMBOL', spcAddress.address);
            expect(resultTransfered.length).to.equal(1);
            expect(resultTransfered[0].symbol).to.equal(stoReleaseParams.symbol);
            expect(resultTransfered[0].rate).to.equal(stoReleaseParams.rate);
            expect(resultTransfered[0].raisedAmount).to.equal(stIssueParams.amount);
            expect(resultTransfered[0].soldTokensAmount).to.equal(stIssueParams.amount);
            expect(resultTransfered[0].investorCount).to.equal(2); // Alice,Bob:2名
            expect(resultTransfered[0].contractAddress).to.equal(stoAddress);

            // ST償還パラメータ（Aliceから全額、Bobから半額償還）
            const stRepaymentParamsAlice: StRepaymentParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                from: context.accounts.aliceWallet.address,
                amount: 500
            };
            await (await stRepaymentContract.repay(stRepaymentParamsAlice)).wait();
            const stRepaymentParamsBob: StRepaymentParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                from: context.accounts.bobWallet.address,
                amount: 250
            };
            await (await stRepaymentContract.repay(stRepaymentParamsBob)).wait();

            const resultStos = await stReferenceContract.getStos('TEST_SYMBOL', spcAddress.address);
            expect(resultStos.length).to.equal(1);
            expect(resultStos[0].symbol).to.equal(stoReleaseParams.symbol);
            expect(resultStos[0].rate).to.equal(stoReleaseParams.rate);
            expect(resultStos[0].raisedAmount).to.equal(stIssueParams.amount);
            expect(resultStos[0].soldTokensAmount).to.equal(stIssueParams.amount);
            expect(resultStos[0].investorCount).to.equal(1); // Aliceが対象外となり、Bobのみ:1名
            expect(resultStos[0].contractAddress).to.equal(stoAddress);
            // TODO:STOリスト複数

            
            // コントラクトをV2にUpgrade（trexGateway等の設定はそのまま引き継がれるためset不要）
            const stReferenceV2Factory = await ethers.getContractFactory("StReferenceV2");
            const stReferenceV2Contract = await upgrades.upgradeProxy(stReferenceContract.address, stReferenceV2Factory) as StReference;
            
            const resultTokenHoldersV2 = await stReferenceV2Contract.getStos('TEST_SYMBOL', spcAddress.address);
            expect(resultTokenHoldersV2.length).to.equal(2);
        });

    });
});
