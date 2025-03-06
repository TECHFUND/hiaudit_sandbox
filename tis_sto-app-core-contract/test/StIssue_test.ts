import '@nomiclabs/hardhat-ethers';
import { BigNumber, Signer } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect, assert } from 'chai';
import { loadFixture, reset } from '@nomicfoundation/hardhat-network-helpers';
import { Interface } from "ethers/lib/utils";

//import * from '../typechain-types/@tokenysolutions/t-rex/contracts/factory/ITREXGateway';
import { deployFullSuiteFixture } from './fixtures/deploy-full-suite.fixture';
import type { StRelease } from '../typechain-types/contracts/biz/StRelease';
import type { StoRelease } from '../typechain-types/contracts/biz/StoRelease';
import type { StIssue } from '../typechain-types/contracts/biz/StIssue';

type StReleaseParams = StRelease.StReleaseParamsStruct;
type StoReleaseParams = StoRelease.StoReleaseParamsStruct;
type StIssueParams = StIssue.StIssueParamsStruct;

const TX_SUCCESS = 0x1; // receipt.statusの正常終了判定用定数
const NOW = Math.floor(Date.now() / 1000 - 60); // hardhat内の時刻ズレ対応(1分バッファ)
const YESTERDAY = NOW - 60 * 60 * 24; // 昨日
const TOMORROW = NOW + 60 * 60 * 24; // 翌日
const LAST_WEEK = NOW - 60 * 60 * 24 * 7; // 先週
const NEXT_WEEK = NOW + 60 * 60 * 24 * 7; // 来週
let accountsMap: { [key: string]: Signer } = {};

// StIssue.solのデプロイ
async function deployContracts() {
    const [owner, spcAddress, tmpAddress] = await ethers.getSigners(); // 最大20アドレス

    const stIssueFactory = await ethers.getContractFactory('StIssue');
    const stIssueContract = await stIssueFactory.deploy();
    await stIssueContract.deployed();

    return {
      owner,
      spcAddress,
      tmpAddress,
      stIssueContract
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

    // 初期処理（initialize）
    const stIssueDeployFunction = await upgrades.deployProxy(
        (await ethers.getContractFactory('StIssue', owner)), [], {initializer: 'initialize', kind:'uups'});
    const stIssueContract: StIssue = await stIssueDeployFunction.connect(owner).deployed() as StIssue;

    return {
        owner,
        spcAddress,
        tmpAddress,
        stIssueContract,
        stoReleaseContract,
        stReleaseContract,
        context
    };
}

// ST発行テスト
describe('[StIssue_test]', function () {

    before(async function() {
        await reset();
        const { owner, spcAddress, tmpAddress, stIssueContract, stoReleaseContract,
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
        console.log(`      StIssueContract address: ${stIssueContract.address}`);
        console.log(`-------------------------------------------------------------------------`);
        console.log(`          aliceWallet address: ${context.accounts.aliceWallet.address}`);
        console.log(`            bobWallet address: ${context.accounts.bobWallet.address}`);
        console.log(`        charlieWallet address: ${context.accounts.charlieWallet.address}`);
        console.log(`          davidWallet address: ${context.accounts.davidWallet.address}`);
        console.log(`-------------------------------------------------------------------------`);
    });

    // コントラクト初期化
    describe('StIssue#initialize', function () {

        // [正常系] コントラクト初期化
        it('[NORMAL]initialize success', async function () {
            const { owner, spcAddress, tmpAddress, stIssueContract } = await loadFixture(deployContracts);

            // initialize を確認
            const receipt  = await (await stIssueContract.initialize()).wait();
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
            expect(await stIssueContract.paused()).to.equal(false);
            expect(await stIssueContract.owner()).to.equal(owner.address);
        });

        // [異常系] コントラクト初期化（二重実行）
        it('[ERROR]initialize failure(duplicated run)', async function () {
            const { owner, spcAddress, tmpAddress, stIssueContract } = await loadFixture(deployContracts);

            // initialize（初回）を確認
            const receipt  = await (await stIssueContract.initialize()).wait();
            expect(receipt.status).to.equal(TX_SUCCESS);

            // initialize（owner以外から実行）の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stIssueContract.connect(spcAddress).initialize({ gasLimit: 6000000 });
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

    // ST発行
    describe('StIssue#issue', function () {

        // [正常系] ST発行（1回）: ownerでの実行
        it('[NORMAL]issue success from owner', async function () {
            await executeStIssueTest(false);
        });

        // [正常系] ST発行（1回）: SPCアドレスでの実行
        it('[NORMAL]issue success from SPC', async function () {
            await executeStIssueTest(true);
        });

        // [正常系] ST発行（1回）
        async function executeStIssueTest(isSPC: boolean = false) {
            const { owner, spcAddress, tmpAddress, stIssueContract, stoReleaseContract,
                stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備
            // ST公開・STO公開
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

            // ST発行パラメータ
            const stIssueParams: StIssueParams = {
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
            };

            // ST発行
            const tx = await stIssueContract.connect(isSPC ? spcAddress : owner).issue(stIssueParams);
            // console.log('[tx]:', tx);

            const receipt = await tx.wait();
            // console.log('[receipt]:', receipt);

            // StIssuedイベントを確認
            const eventStIssued = receipt.events?.find(e => e.event === 'StIssued');
            if (!eventStIssued?.args) {
                console.log('StIssued イベントが発行されませんでした。');
                assert.fail();
            }

            expect(eventStIssued.args.length).to.equal(5);
            expect(eventStIssued.args[0]._isIndexed).to.equal(true);
            expect(eventStIssued.args[0].hash).to.equal(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(await stIssueParams.symbol)));
            expect(eventStIssued.args[1]).to.equal(stIssueParams.spcAddress);
            expect(eventStIssued.args[2]).to.equal(stIssueParams.stoAddress);
            expect(eventStIssued.args[3]).to.equal(stIssueParams.investor);
            expect(eventStIssued.args[4]).to.equal(stIssueParams.amount);

// （TokenHolderUpdatedは匿名イベント化して取得できないため別手段で確認する）
// TokenHolderの更新状態確認
// TokenHolderUpdatedイベントを確認
// const eventTokenHolderUpdated = receipt.events?.find(e => e.event === 'TokenHolderUpdated');
// if (!eventTokenHolderUpdated?.args) {
//     console.log('TokenHolderUpdated イベントが発行されませんでした。');
//     assert.fail();
// }
// expect(eventTokenHolderUpdated.args.length).to.equal(8);
// expect(eventTokenHolderUpdated.args[0]).to.equal(stIssueParams.symbol);
// expect(eventTokenHolderUpdated.args[1]).to.equal(stIssueParams.spcAddress);
// expect(eventTokenHolderUpdated.args[2]).to.equal(stIssueParams.investor);
// expect(eventTokenHolderUpdated.args[3]).to.equal(stIssueParams.timeCanReceiveAfter);
// expect(eventTokenHolderUpdated.args[4]).to.equal(stIssueParams.timeCanSendAfter);
// expect(eventTokenHolderUpdated.args[5]).to.equal(stIssueParams.kycExpiry);
// expect(eventTokenHolderUpdated.args[6]).to.equal(stIssueParams.canBuyFromSto);
// expect(eventTokenHolderUpdated.args[7]).to.not.equal(ethers.constants.AddressZero);

// const tokenHolderContractAddress = eventTokenHolderUpdated.args[7];
// const tokenHolderContractAddress = eventData.tokenHolderContractAddress;
// const tokenHolderContract = await ethers.getContractAt('ITokenHolder', tokenHolderContractAddress);
// expect(await tokenHolderContract.symbol()).to.equal(stIssueParams.symbol);
// expect(await tokenHolderContract.spcAddress()).to.equal(stIssueParams.spcAddress);
// expect(await tokenHolderContract.walletAddress()).to.equal(stIssueParams.investor);
// expect(await tokenHolderContract.timeCanReceiveAfter()).to.equal(stIssueParams.timeCanReceiveAfter);
// expect(await tokenHolderContract.timeCanSendAfter()).to.equal(stIssueParams.timeCanSendAfter);
// expect(await tokenHolderContract.kycExpiry()).to.equal(stIssueParams.kycExpiry);
// expect(await tokenHolderContract.canBuyFromSto()).to.equal(stIssueParams.canBuyFromSto);
// expect(await tokenHolderContract.isRevoked()).to.equal(false);

            // STO単位でのトークンホルダ情報取得を確認
            expect(await context.suite.stoRegistry.getSto(stIssueParams.spcAddress, stIssueParams.symbol)).to.equal(stoAddress);
            const stoContract = await ethers.getContractAt('ISecurityTokenOffering', stoAddress);
            const allTokenHolders = await stoContract.allTokenHolders();
            expect(allTokenHolders.length).to.equal(1);
            const tokenHolderContract = await ethers.getContractAt('ITokenHolder', allTokenHolders[0]);
            expect(await tokenHolderContract.symbol()).to.equal(stIssueParams.symbol);
            expect(await tokenHolderContract.spcAddress()).to.equal(stIssueParams.spcAddress);
            expect(await tokenHolderContract.walletAddress()).to.equal(stIssueParams.investor);
            expect(await tokenHolderContract.timeCanReceiveAfter()).to.equal(stIssueParams.timeCanReceiveAfter);
            expect(await tokenHolderContract.timeCanSendAfter()).to.equal(stIssueParams.timeCanSendAfter);
            expect(await tokenHolderContract.kycExpiry()).to.equal(stIssueParams.kycExpiry);
            expect(await tokenHolderContract.canBuyFromSto()).to.equal(stIssueParams.canBuyFromSto);
            expect(await tokenHolderContract.isRevoked()).to.equal(false);

            // STO：1回分のST発行の内容が一致していること
            const stos = await context.suite.stoRegistry.getStos(stIssueParams.spcAddress, stIssueParams.symbol);
            expect(stos.length).to.equal(1);
            expect(stos[0]).to.equal(stoAddress);

            const stoValue = await stoContract.value();
            expect(stoValue.symbol).to.equal(stoReleaseParams.symbol);
            expect(stoValue.rate).to.equal(stoReleaseParams.rate);
            const expectedAmount = BigNumber.from(stIssueParams.amount).mul(BigNumber.from(stoReleaseParams.rate));
            expect(stoValue.raisedAmount).to.equal(expectedAmount);
            expect(stoValue.soldTokensAmount).to.equal(expectedAmount);
            expect(stoValue.investorCount).to.equal(1);
            expect(stoValue.contractAddress).to.equal(stoAddress);

            // Identity：初期開発としては使用しないが、利用はできる状態になっていることを空の値でassert。
            const onchainIDAddress = await tokenHolderContract.onchainId();
            expect(onchainIDAddress).to.not.equal(ethers.constants.AddressZero);
            const identityContract = await ethers.getContractAt('Identity', onchainIDAddress);
            const emptyClaim = await identityContract.getClaim(ethers.utils.randomBytes(32));
            expect(emptyClaim.topic).to.equal(BigNumber.from(0));
            expect(emptyClaim.scheme).to.equal(BigNumber.from(0));
            expect(emptyClaim.issuer).to.equal(ethers.constants.AddressZero);
            expect(emptyClaim.signature).to.equal('0x');
            expect(emptyClaim.data).to.equal('0x');
            expect(emptyClaim.uri).to.equal('');

            
            // コントラクトをV2にUpgrade（trexGateway等の設定はそのまま引き継がれるためset不要）
            const stIssueV2Factory = await ethers.getContractFactory("StIssueV2");
            const stIssueV2Contract = await upgrades.upgradeProxy(stIssueContract.address, stIssueV2Factory) as StIssue;
            
            // 事前準備
            const stIssueParamsV2: StIssueParams = {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                stoAddress: stoAddress,
                investor: context.accounts.aliceWallet.address,
                amount: 2000,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: NOW,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            };

            // イベントを取得できることを確認
            const txV2 = await stIssueV2Contract.connect(isSPC ? spcAddress : owner).issue(stIssueParamsV2);
            const receiptV2 = await txV2.wait();

            // StIssuedイベントを確認
            const eventStIssuedV2 = receiptV2.events?.find(e => e.event === 'StIssuedV2');
            if (!(eventStIssuedV2?.args)) {
                console.log('StIssuedV2 イベントが発行されませんでした。');
                assert.fail();
            }
            expect(eventStIssuedV2.args.length).to.equal(6);
            expect(eventStIssuedV2.args[5]).to.equal(isSPC ? spcAddress.address : owner.address);
        }

        // [正常系] ST発行（複数回）: ownerでの実行
        it('[NORMAL]issue success(multiple) from owner', async function () {
            await executeMultipleStIssueTest(false);
        });

        // [正常系] ST発行（複数回）: SPCアドレスでの実行
        it('[NORMAL]issue success(multiple) from SPC', async function () {
            await executeMultipleStIssueTest(true);
        });

        // [正常系] ST発行（複数回）
        // (spcAddress, 'TEST_SYMBOL' )：0[alice],3[bob],5[alice]
        // (tmpAddress, 'TEST_SYMBOL2')：1[alice],4[alice]
        // (spcAddress, 'TEST_SYMBOL3')：2[alice]
        async function executeMultipleStIssueTest(isSPC: boolean = false) {
            const { owner, spcAddress, tmpAddress, stIssueContract, stoReleaseContract,
                stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備（2番目のSPCはtmpAddressとする）
            const stReleaseParams: StReleaseParams[] = [
                { symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address },
                { symbol: 'TEST_SYMBOL2', spcAddress: tmpAddress.address },
                { symbol: 'TEST_SYMBOL3', spcAddress: spcAddress.address },
            ];
            for (const stReleaseParam of stReleaseParams) {
                await (await stReleaseContract.release(stReleaseParam)).wait();
            }
            const stoReleaseParams: StoReleaseParams[] = [ // 順序シャッフル
                { symbol: 'TEST_SYMBOL' , spcAddress: spcAddress.address, rate: 1 },
                { symbol: 'TEST_SYMBOL2', spcAddress: tmpAddress.address, rate: 1 },
                { symbol: 'TEST_SYMBOL3', spcAddress: spcAddress.address, rate: 2 },
            ];
            let stoAddresses = [];
            for (const stoReleaseParam of stoReleaseParams) {
                const stoReleaseReceipt = await (await stoReleaseContract.release(stoReleaseParam)).wait();
                
                const eventStoReleased = stoReleaseReceipt.events?.find(e => e.event === 'StoReleased');
                if (!eventStoReleased?.args) {
                    console.log('StoReleased イベントが発行されませんでした。');
                    assert.fail();
                }
                stoAddresses.push(eventStoReleased.args[3]);
            }

            // ST発行パラメータ
            const stIssueParams: StIssueParams[] = [{
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                stoAddress: stoAddresses[0],
                investor: context.accounts.aliceWallet.address,
                amount: 1000,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: NOW,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            }, {
                symbol: 'TEST_SYMBOL2',
                spcAddress: tmpAddress.address,
                addPermissionList: true,
                stoAddress: stoAddresses[1],
                investor: context.accounts.aliceWallet.address,
                amount: 2000,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: YESTERDAY,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            }, {
                symbol: 'TEST_SYMBOL3',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                stoAddress: stoAddresses[2],
                investor: context.accounts.aliceWallet.address,
                amount: 3000,
                timeCanReceiveAfter: YESTERDAY,
                timeCanSendAfter: NOW,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            }, {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                stoAddress: stoAddresses[0],
                investor: context.accounts.bobWallet.address, // Bob
                amount: 4000,
                timeCanReceiveAfter: LAST_WEEK,
                timeCanSendAfter: YESTERDAY,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            }, {
                symbol: 'TEST_SYMBOL2',
                spcAddress: tmpAddress.address,
                addPermissionList: false, // 更新しない
                stoAddress: stoAddresses[1],
                investor: context.accounts.aliceWallet.address,
                amount: 5000,
                timeCanReceiveAfter: TOMORROW,
                timeCanSendAfter: TOMORROW,
                kycExpiry: YESTERDAY,
                canBuyFromSto: false
            }, {
                symbol: 'TEST_SYMBOL',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                stoAddress: stoAddresses[0],
                investor: context.accounts.aliceWallet.address,
                amount: 6000,
                timeCanReceiveAfter: YESTERDAY,
                timeCanSendAfter: LAST_WEEK,
                kycExpiry: NEXT_WEEK,
                canBuyFromSto: true
            }];

            let stoRegistryAddress = '';
            let tokenAddresses: string[] = [];
            for (const param of stIssueParams) {
                // ST発行
                const receipt = await(await stIssueContract.connect(
                    isSPC ? accountsMap[(await param.spcAddress)] : owner).issue(param)).wait();

                // StIssuedイベントを確認
                const eventStIssued = receipt.events?.find(e => e.event === 'StIssued');
                if (!eventStIssued?.args) {
                    console.log('StIssued イベントが発行されませんでした。');
                    assert.fail();
                }
                expect(eventStIssued.args.length).to.equal(5);
                expect(eventStIssued.args[0]._isIndexed).to.equal(true);
                expect(eventStIssued.args[0].hash).to.equal(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(await param.symbol)));
                expect(eventStIssued.args[1]).to.equal(param.spcAddress);
                expect(eventStIssued.args[2]).to.equal(param.stoAddress);
                expect(eventStIssued.args[3]).to.equal(param.investor);
                expect(eventStIssued.args[4]).to.equal(param.amount);
            }

            // STO単位でのトークンホルダ情報取得を確認
            // [0]:'TEST_SYMBOL' + spcAddress
            // 0[alice],3[bob],5[alice]番目のトークンは、(spcAddress, 'TEST_SYMBOL')で登録されていること
            // alice:stIssueParams[5]で上書きした情報、bob:stIssueParams[3]で設定した情報
            expect(await context.suite.stoRegistry.getSto(stIssueParams[0].spcAddress, stIssueParams[0].symbol)).to.equal(stIssueParams[0].stoAddress);
            const stoContract0 = await ethers.getContractAt('ISecurityTokenOffering', stoAddresses[0]);
            const allTokenHolders0 = await stoContract0.allTokenHolders();
            expect(allTokenHolders0.length).to.equal(2);
            for (const tokenHolder of allTokenHolders0) {
                const tokenHolderContract = await ethers.getContractAt('ITokenHolder', tokenHolder);
                expect(await tokenHolderContract.symbol()).to.equal(stIssueParams[0].symbol);
                expect(await tokenHolderContract.spcAddress()).to.equal(stIssueParams[0].spcAddress);
                if ((await tokenHolderContract.walletAddress()) == context.accounts.aliceWallet.address) {
                    expect(await tokenHolderContract.timeCanReceiveAfter()).to.equal(YESTERDAY);
                    expect(await tokenHolderContract.timeCanSendAfter()).to.equal(LAST_WEEK);
                    expect(await tokenHolderContract.kycExpiry()).to.equal(NEXT_WEEK);
                    expect(await tokenHolderContract.canBuyFromSto()).to.equal(true);
                    expect(await tokenHolderContract.isRevoked()).to.equal(false);
                } else if ((await tokenHolderContract.walletAddress()) == context.accounts.bobWallet.address) {
                    expect(await tokenHolderContract.timeCanReceiveAfter()).to.equal(LAST_WEEK);
                    expect(await tokenHolderContract.timeCanSendAfter()).to.equal(YESTERDAY);
                    expect(await tokenHolderContract.kycExpiry()).to.equal(TOMORROW);
                    expect(await tokenHolderContract.canBuyFromSto()).to.equal(true);
                    expect(await tokenHolderContract.isRevoked()).to.equal(false);
                } else {
                    assert.fail();
                }
            }

            // [1]:'TEST_SYMBOL2' + tmpAddress
            // 1[alice],4[alice]番目のトークンは、(tmpAddress, 'TEST_SYMBOL2')で登録されていること
            // alice:stIssueParams[1]で設定した情報（stIssueParams[4]はaddPermissionList:falseで上書き無し）
            expect(await context.suite.stoRegistry.getSto(stIssueParams[1].spcAddress, stIssueParams[1].symbol)).to.equal(stIssueParams[1].stoAddress);
            const stoContract1 = await ethers.getContractAt('ISecurityTokenOffering', stoAddresses[1]);
            const allTokenHolders1 = await stoContract1.allTokenHolders();
            expect(allTokenHolders1.length).to.equal(1);
            const tokenHolderContract1 = await ethers.getContractAt('ITokenHolder', allTokenHolders1[0]);
            expect(await tokenHolderContract1.symbol()).to.equal(stIssueParams[1].symbol);
            expect(await tokenHolderContract1.spcAddress()).to.equal(stIssueParams[1].spcAddress);
            expect(await tokenHolderContract1.walletAddress()).to.equal(context.accounts.aliceWallet.address);
            expect(await tokenHolderContract1.timeCanReceiveAfter()).to.equal(NOW);
            expect(await tokenHolderContract1.timeCanSendAfter()).to.equal(YESTERDAY);
            expect(await tokenHolderContract1.kycExpiry()).to.equal(TOMORROW);
            expect(await tokenHolderContract1.canBuyFromSto()).to.equal(true);
            expect(await tokenHolderContract1.isRevoked()).to.equal(false);
            
            // [2]:'TEST_SYMBOL3' + spcAddress
            // 2[alice]番目のトークンは、(spcAddress, 'TEST_SYMBOL3')で登録されていること
            // alice:stIssueParams[2]で設定した情報
            expect(await context.suite.stoRegistry.getSto(stIssueParams[2].spcAddress, stIssueParams[2].symbol)).to.equal(stIssueParams[2].stoAddress);
            const stoContract2 = await ethers.getContractAt('ISecurityTokenOffering', stoAddresses[2]);
            const allTokenHolders2 = await stoContract2.allTokenHolders();
            expect(allTokenHolders2.length).to.equal(1);
            const tokenHolderContract2 = await ethers.getContractAt('ITokenHolder', allTokenHolders2[0]);
            expect(await tokenHolderContract2.symbol()).to.equal(stIssueParams[2].symbol);
            expect(await tokenHolderContract2.spcAddress()).to.equal(stIssueParams[2].spcAddress);
            expect(await tokenHolderContract2.walletAddress()).to.equal(context.accounts.aliceWallet.address);
            expect(await tokenHolderContract2.timeCanReceiveAfter()).to.equal(YESTERDAY);
            expect(await tokenHolderContract2.timeCanSendAfter()).to.equal(NOW);
            expect(await tokenHolderContract2.kycExpiry()).to.equal(TOMORROW);
            expect(await tokenHolderContract2.canBuyFromSto()).to.equal(true);
            expect(await tokenHolderContract2.isRevoked()).to.equal(false);

            // STO：1回分のST発行の内容が一致していること
            // 0[alice],3[bob],5[alice]番目のトークンは、(spcAddress, 'TEST_SYMBOL')で登録されていること
            const stos0 = await context.suite.stoRegistry.getStos(stIssueParams[0].spcAddress, stIssueParams[0].symbol);
            expect(stos0.length).to.equal(1);
            expect(stos0[0]).to.equal(stoAddresses[0]);

            const stoValue0 = await stoContract0.value();
            expect(stoValue0.symbol).to.equal(stoReleaseParams[0].symbol);
            expect(stoValue0.rate).to.equal(stoReleaseParams[0].rate);
            const expectedAmount0 = BigNumber.from(stIssueParams[0].amount).mul(BigNumber.from(stoReleaseParams[0].rate))
                .add(BigNumber.from(stIssueParams[3].amount).mul(BigNumber.from(stoReleaseParams[0].rate)))
                .add(BigNumber.from(stIssueParams[5].amount).mul(BigNumber.from(stoReleaseParams[0].rate)));
            expect(stoValue0.raisedAmount).to.equal(expectedAmount0);
            expect(stoValue0.soldTokensAmount).to.equal(expectedAmount0);
            expect(stoValue0.investorCount).to.equal(2);
            expect(stoValue0.contractAddress).to.equal(stoAddresses[0]);

            // 1[alice],4[alice]番目のトークンは、(tmpAddress, 'TEST_SYMBOL2')で登録されていること
            const stos1 = await context.suite.stoRegistry.getStos(stIssueParams[1].spcAddress, stIssueParams[1].symbol);
            expect(stos1.length).to.equal(1);
            expect(stos1[0]).to.equal(stoAddresses[1]);

            const stoValue1 = await stoContract1.value();
            expect(stoValue1.symbol).to.equal(stoReleaseParams[1].symbol);
            expect(stoValue1.rate).to.equal(stoReleaseParams[1].rate);
            const expectedAmount1 = BigNumber.from(stIssueParams[1].amount).mul(BigNumber.from(stoReleaseParams[1].rate))
                .add(BigNumber.from(stIssueParams[4].amount).mul(BigNumber.from(stoReleaseParams[1].rate)));
            expect(stoValue1.raisedAmount).to.equal(expectedAmount1);
            expect(stoValue1.soldTokensAmount).to.equal(expectedAmount1);
            expect(stoValue1.investorCount).to.equal(1);
            expect(stoValue1.contractAddress).to.equal(stoAddresses[1]);

            // 2[alice]番目のトークンは、(spcAddress, 'TEST_SYMBOL3')で登録されていること
            const stos2 = await context.suite.stoRegistry.getStos(stIssueParams[2].spcAddress, stIssueParams[2].symbol);
            expect(stos2.length).to.equal(1);
            expect(stos2[0]).to.equal(stoAddresses[2]);

            const stoValue2 = await stoContract2.value();
            expect(stoValue2.symbol).to.equal(stoReleaseParams[2].symbol);
            expect(stoValue2.rate).to.equal(stoReleaseParams[2].rate);
            const expectedAmount2 = BigNumber.from(stIssueParams[2].amount).mul(BigNumber.from(stoReleaseParams[2].rate));
            expect(stoValue2.raisedAmount).to.equal(expectedAmount2);
            expect(stoValue2.soldTokensAmount).to.equal(expectedAmount2);
            expect(stoValue2.investorCount).to.equal(1);
            expect(stoValue2.contractAddress).to.equal(stoAddresses[2]);
        }

        // [異常系] ST発行（不正な実行者:購入者のアドレス）
        it('[ERROR]issue failure(invalid executor)', async function () {
            const { owner, spcAddress, tmpAddress, stIssueContract, stoReleaseContract,
                stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備
            // ST公開・STO公開
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
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            };

            // ST発行：異常終了確認
            try {
                await stIssueContract.connect(context.accounts.aliceWallet).issue(stIssueParams);
                assert.fail();
            } catch (error: any) {
                // errorを正常に取得できないため、手動パースする
                const iface = new Interface(["error InvalidExecutor(address)"]);
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidExecutor');
                expect(decodedError.args[0]).to.equal(context.accounts.aliceWallet.address);
            }
        });

        // stIssueContract#issueが空振り（コントラクトが呼び出されずに正常終了）するHardhat不具合が発生する場合アリ
        // [異常系] ST発行（STO未公開）
        it('[ERROR]issue failure(without STO release)', async function () {
            const { owner, spcAddress, tmpAddress, stIssueContract, stoReleaseContract,
                stReleaseContract, context } = await loadFixture(setupContracts);

            // ST公開のみ（STO公開無し）
            const stReleaseParams0: StReleaseParams = {
                symbol: 'TEST_SYMBOL0', spcAddress: spcAddress.address
            };
            await (await stReleaseContract.release(stReleaseParams0)).wait();

            // ST発行
            const stoAddress = await context.suite.stoRegistry.getSto(spcAddress.address, 'TEST_SYMBOL0'); // STOアドレス強制取得
            const stIssueParams: StIssueParams = {
                symbol: 'TEST_SYMBOL0',
                spcAddress: spcAddress.address,
                addPermissionList: true,
                stoAddress: stoAddress,
                investor: context.accounts.aliceWallet.address,
                amount: 1111,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: NOW,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            };

            // ST発行：異常終了確認（STOのownerが初期化されないため権限判定ができずエラー）
            try {
                await stIssueContract.issue(stIssueParams);
                assert.fail();
            } catch (error: any) {
                // 別コントラクト内のerrorを正常に取得できないため、手動パースする
                const iface = new Interface(["error InvalidSender(address)"]);
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidSender');
            }
        });

        // [異常系] ST発行（初回からユーザ登録無しで実行:stoからtokenHolderを取得できずaddress(0)）
        it('[ERROR]issue failure(no-registed account)', async function () {
            const { owner, spcAddress, tmpAddress, stIssueContract, stoReleaseContract,
                stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備
            // ST公開・STO公開
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
                addPermissionList: false, // 初回実行で登録せずに発行
                stoAddress: stoAddress,
                investor: context.accounts.aliceWallet.address,
                amount: 1000,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: NOW,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            };

            // ST発行：異常終了確認
            try {
                await stIssueContract.issue(stIssueParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include(`InvalidAddress("${ethers.constants.AddressZero}", "tokenHolder")`);
            }
        });

        // [異常系] ST発行（不正な発行先ウォレットアドレス）
        it('[ERROR]issue failure(invalid investor)', async function () {
            const { owner, spcAddress, tmpAddress, stIssueContract, stoReleaseContract,
                stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備
            // ST公開・STO公開
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
                investor: ethers.constants.AddressZero, // 不正な発行先：ゼロアドレス
                amount: 1000,
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: NOW,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            };

            // ST発行：異常終了確認
            try {
                await stIssueContract.issue(stIssueParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include(`InvalidAddress("${ethers.constants.AddressZero}", "params.walletAddress")`);
            }
        });

        // [異常系] ST発行（不正なトークン量）
        it('[ERROR]issue failure(invalid amount)', async function () {
            const { owner, spcAddress, tmpAddress, stIssueContract, stoReleaseContract,
                stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備
            // ST公開・STO公開
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
                amount: 0,  // ゼロ購入
                timeCanReceiveAfter: NOW,
                timeCanSendAfter: NOW,
                kycExpiry: TOMORROW,
                canBuyFromSto: true
            };

            // ST発行：異常終了確認
            try {
                await stIssueContract.issue(stIssueParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('InvalidAmount()');
            }
        });

        // [異常系] ST発行（トークンホルダKYC期限切れ）
        it('[ERROR]issue failure(expired KYC)', async function () {
            const { owner, spcAddress, tmpAddress, stIssueContract, stoReleaseContract,
                stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備
            // ST公開・STO公開
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
                kycExpiry: YESTERDAY, // 昨日期限切れ
                canBuyFromSto: true
            };

            // ST発行：異常終了確認
            try {
                await stIssueContract.issue(stIssueParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('InvestorKycExpired');
                expect(error.message).to.include('tokenHolder');
            }
        });

        // [異常系] ST発行（STO購入不可）
        it('[ERROR]issue failure(cannot buy from STO)', async function () {
            const { owner, spcAddress, tmpAddress, stIssueContract, stoReleaseContract,
                stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備
            // ST公開・STO公開
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
                kycExpiry: TOMORROW,
                canBuyFromSto: false // STOからの購入不可
            };

            // ST発行：異常終了確認
            try {
                await stIssueContract.issue(stIssueParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('PurchaseUnauthorizedInvestor');
            }
        });

    });
});

