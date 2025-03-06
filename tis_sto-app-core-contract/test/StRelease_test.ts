import '@nomiclabs/hardhat-ethers';
import { Signer } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect, assert } from 'chai';
import { loadFixture, reset } from '@nomicfoundation/hardhat-network-helpers';
import { Interface } from "ethers/lib/utils";

//import * from '../typechain-types/@tokenysolutions/t-rex/contracts/factory/ITREXGateway';
import { deployFullSuiteFixture } from './fixtures/deploy-full-suite.fixture';
import type { StRelease } from '../typechain-types/contracts/biz/StRelease';
type StReleaseParams = StRelease.StReleaseParamsStruct;

const TX_SUCCESS = 0x1; // receipt.statusの正常終了判定用定数
let accountsMap: { [key: string]: Signer } = {};

// StRelease.solのデプロイ
async function deployContracts() {
    const [owner, spcAddress, tmpAddress] = await ethers.getSigners(); // 最大20アドレス

    const stReleaseFactory = await ethers.getContractFactory('StRelease');
    const stReleaseContract = await stReleaseFactory.deploy();
    await stReleaseContract.deployed();

    return {
      owner,
      spcAddress,
      tmpAddress,
      stReleaseContract
    };
}

// ERC3643動作環境のセットアップ＋StRelease.solのセットアップ（デプロイ＋初期処理）
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

    // 初期処理（initialize, setTrexGateway, TREXGateway#addDeployer）
    const stReleaseDeployFunction = await upgrades.deployProxy(
        (await ethers.getContractFactory('StRelease', owner)), [], {initializer: 'initialize', kind:'uups'});
    const stReleaseContract: StRelease = await stReleaseDeployFunction.connect(owner).deployed() as StRelease;
    await (await stReleaseContract.setTrexGateway(context.suite.trexGatewayContract.address)).wait();
    await (await context.suite.trexGatewayContract.addDeployer(stReleaseContract.address)).wait();

    return {
        owner,
        spcAddress,
        tmpAddress,
        stReleaseContract,
        context
    };
}

// ST公開テスト
describe('[StRelease_test]', function () {

    before(async function() {
        await reset();
        const { owner, spcAddress, tmpAddress, stReleaseContract, context } = await loadFixture(setupContracts);

        // デプロイ先のアドレス情報出力
        console.log(`-------------------------------------------------------------------------`);
        console.log(`Deployed Address`);
        console.log(`-------------------------------------------------------------------------`);
        console.log(`      Owner(deployer) address: ${owner.address}`);
        console.log(`     SPC(tokenIssuer) address: ${spcAddress.address}`);
        console.log(`           TmpAddress address: ${tmpAddress.address}`);
        console.log(`    StReleaseContract address: ${stReleaseContract.address}`);
        console.log(`-------------------------------------------------------------------------`);
    });

    // コントラクト初期化
    describe('StRelease#initialize', function () {

        // [正常系] コントラクト初期化
        it('[NORMAL]initialize success', async function () {

            const { owner, spcAddress, tmpAddress, stReleaseContract } = await loadFixture(deployContracts);

            // initialize を確認
            const receipt  = await (await stReleaseContract.initialize()).wait();
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
            expect(await stReleaseContract.paused()).to.equal(false);
            expect(await stReleaseContract.owner()).to.equal(owner.address);
        });

        // [異常系] コントラクト初期化（二重実行）
        it('[ERROR]initialize failure(duplicated run)', async function () {
            const { owner, spcAddress, tmpAddress, stReleaseContract } = await loadFixture(deployContracts);

            // initialize（初回）を確認
            const receipt  = await (await stReleaseContract.initialize()).wait();
            expect(receipt.status).to.equal(TX_SUCCESS);

            // initialize（owner以外から実行）の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stReleaseContract.connect(spcAddress).initialize({ gasLimit: 6000000 });
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
    describe('StRelease#setTrexGateway', function () {

        // [正常系] アドレス設定
        it('[NORMAL]setTrexGateway success', async function () {
            const { owner, spcAddress, tmpAddress, stReleaseContract } = await loadFixture(deployContracts);
            await (await stReleaseContract.initialize()).wait();

            // setTrexGateway を確認
            expect((await (await stReleaseContract.setTrexGateway(tmpAddress.address)).wait()).status).to.equal(TX_SUCCESS);
        });

        // [異常系] アドレス設定（address異常時:AddressZero）
        it('[ERROR]setTrexGateway failure(invalid address(0))', async function () {
            const { owner, spcAddress, tmpAddress, stReleaseContract } = await loadFixture(deployContracts);
            await (await stReleaseContract.initialize()).wait();

            // setTrexGateway address異常時の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stReleaseContract.setTrexGateway(ethers.constants.AddressZero);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('InvalidTrexGatewayAddress("0x0000000000000000000000000000000000000000")');
            }
        });

        // [異常系] アドレス設定（権限エラー：owner以外から実行）
        it('[ERROR]setTrexGateway failure(not owner)', async function () {
            const { owner, spcAddress, tmpAddress, stReleaseContract } = await loadFixture(deployContracts);
            await (await stReleaseContract.initialize()).wait();

            // setTrexGateway（owner以外から実行）の挙動を確認
            try {
                // tx.wait() より前にエラーとなること
                await stReleaseContract.connect(spcAddress).setTrexGateway(tmpAddress.address);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('Ownable: caller is not the owner');
            }
        });
    });

    // ST公開
    describe('StRelease#release', function () {

        // [正常系] ST公開（1回）: ownerでの実行
        it('[NORMAL]release success from owner', async function () {
            await executeStReleaseTest(false);
        });

        // [正常系] ST公開（1回）: SPCアドレスでの実行
        it('[NORMAL]release success from SPC', async function () {
            await executeStReleaseTest(true);
        });

        // [正常系] ST公開（1回）
        async function executeStReleaseTest(isSPC: boolean = false) {
            const { owner, spcAddress, tmpAddress, stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備
            const stReleaseParams: StReleaseParams = {
                symbol: 'test_symbol', spcAddress: spcAddress.address
            };

            // イベントを取得できることを確認
            const tx = await stReleaseContract.connect(isSPC ? spcAddress : owner).release(stReleaseParams);
            // console.log(tx);

            const receipt = await tx.wait();
            // console.log(receipt);

            // StReleasedイベントを確認
            const eventStReleased = receipt.events?.find(e => e.event === 'StReleased');
            if (!(eventStReleased?.args)) {
                console.log('StReleased イベントが発行されませんでした。');
                assert.fail();
            }

            // デプロイされたTokenの確認
            expect(eventStReleased.args.length).to.equal(3);
            expect(eventStReleased.args[2]).to.not.equal(ethers.constants.AddressZero);
            const tokenContract = await ethers.getContractAt('IToken', eventStReleased.args[2]);
            expect(await tokenContract.decimals()).to.equal(18);
            expect(await tokenContract.name()).to.equal('TEST_SYMBOL');
            expect(await tokenContract.onchainID()).to.equal(spcAddress.address);
            expect(await tokenContract.symbol()).to.equal('TEST_SYMBOL');

            expect(await tokenContract.paused()).to.equal(true); // STO発行前のためtrue
            expect(await tokenContract.isFrozen(owner.address)).to.equal(false);
            expect(await tokenContract.isFrozen(spcAddress.address)).to.equal(false);
            expect(await tokenContract.isFrozen(tmpAddress.address)).to.equal(false);

            // デプロイされたIdentityRegistryStorageをTREXSuiteDeployedイベントで確認：
            // 処理としてemitされているが、TREXSuiteDeployedイベントがreceiptに含まれない。：不使用機能であるため割愛
            // c.f. emit TREXSuiteDeployed(address(token), address(ir), address(irs), address(tir), address(ctr), address(mc), _salt);
//             const eventTREXSuiteDeployed = receipt.events?.find(e => e.event === 'TREXSuiteDeployed');
//             if (!eventTREXSuiteDeployed?.args) {
//                 console.log('TREXSuiteDeployed イベントが発行されませんでした。');
//                 assert.fail();
//             }
//             expect(eventTREXSuiteDeployed.args[2]).to.not.equal(ethers.constants.AddressZero);

            // SPC単位でのTokenアドレス取得を確認
            const spcAddresses = await context.suite.trexFactory.getSecurityTokens(spcAddress.address);
            expect(await spcAddresses.length).to.equal(1);
            expect(await spcAddresses[0]).to.equal(eventStReleased.args[2]);
            // （存在しないSPCアドレスの場合は空配列になることの確認）
            const tmpAddresses = await context.suite.trexFactory.getSecurityTokens(tmpAddress.address);
            expect(await tmpAddresses.length).to.equal(0);

            // コントラクトをV2にUpgrade（trexGateway等の設定はそのまま引き継がれるためset不要）
            const stReleaseV2Factory = await ethers.getContractFactory("StReleaseV2");
            const stReleaseV2Contract = await upgrades.upgradeProxy(stReleaseContract.address, stReleaseV2Factory) as StRelease;
            
            // 事前準備
            const stReleaseParamsV2: StReleaseParams = {
                symbol: 'test_symbol_V2', spcAddress: spcAddress.address
            };

            // イベントを取得できることを確認
            const txV2 = await stReleaseV2Contract.connect(isSPC ? spcAddress : owner).release(stReleaseParamsV2);
            const receiptV2 = await txV2.wait();

            // StReleasedイベントを確認
            const eventStReleasedV2 = receiptV2.events?.find(e => e.event === 'StReleasedV2');
            if (!(eventStReleasedV2?.args)) {
                console.log('StReleasedV2 イベントが発行されませんでした。');
                assert.fail();
            }
            expect(eventStReleasedV2.args.length).to.equal(4);
            expect(eventStReleasedV2.args[3]).to.equal(isSPC ? spcAddress.address : owner.address);
        }

        // [正常系] ST公開（複数回）: ownerでの実行
        it('[NORMAL]release success(multiple) from owner', async function () {
            await executeMultipleStReleaseTest(false);
        });

        // [正常系] ST公開（複数回）: SPCアドレスでの実行
        it('[NORMAL]release success(multiple) from SPC', async function () {
            await executeMultipleStReleaseTest(true);
        });

        // [正常系] ST公開（複数回）
        async function executeMultipleStReleaseTest(isSPC: boolean = false) {
            const { owner, spcAddress, tmpAddress, stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備（2番目のSPCはtmpAddressとする）
            const stReleaseParams: StReleaseParams[] = [
                { symbol: 'TEST_SYMBOL' , spcAddress: spcAddress.address },
                { symbol: 'TEST_SYMBOL2', spcAddress: tmpAddress.address },
                { symbol: 'TEST_SYMBOL3', spcAddress: spcAddress.address },
            ];
            let identityRegistryStorageAddress = '';
            let tokenAddresses: string[] = [];
            for (const param of stReleaseParams) {

                // イベントを取得できることを確認
                const receipt = await(await stReleaseContract.connect(isSPC ? accountsMap[(await param.spcAddress)] : owner).release(param)).wait();

                // StReleasedイベントを確認
                const eventStReleased = receipt.events?.find(e => e.event === 'StReleased');
                if (!eventStReleased?.args) {
                    console.log('StReleased イベントが発行されませんでした。');
                    assert.fail();
                }

                // デプロイされたTokenの確認
                expect(eventStReleased.args[2]).to.not.equal(ethers.constants.AddressZero);
                const tokenContract = await ethers.getContractAt('IToken', eventStReleased.args[2]);
                tokenAddresses.push(eventStReleased.args[2]);
                expect(await tokenContract.decimals()).to.equal(18);
                expect(await tokenContract.name()).to.equal(param.symbol);
                expect(await tokenContract.onchainID()).to.equal(param.spcAddress);
                expect(await tokenContract.symbol()).to.equal(param.symbol);

                expect(await tokenContract.paused()).to.equal(true); // ST初期化前のステータス
                expect(await tokenContract.isFrozen(owner.address)).to.equal(false);
                expect(await tokenContract.isFrozen(spcAddress.address)).to.equal(false);
                expect(await tokenContract.isFrozen(tmpAddress.address)).to.equal(false);

                // デプロイされたIdentityRegistryStorageの確認
                expect(eventStReleased.args[3]).to.not.equal(ethers.constants.AddressZero);
                if (identityRegistryStorageAddress == '') {
                    identityRegistryStorageAddress = eventStReleased.args[3];
                } else {
                    expect(identityRegistryStorageAddress).to.equal(eventStReleased.args[3]);
                }
            }

            // SPC単位でのTokenアドレス取得を確認
            // 1,3番目のトークンは、SPCアドレスがspcAddressで登録されていること
            const addressesOfSpcAddress = await context.suite.trexFactory.getSecurityTokens(spcAddress.address);
            expect(await addressesOfSpcAddress.length).to.equal(2);
            expect(await addressesOfSpcAddress[0]).to.equal(tokenAddresses[0]);
            expect(await addressesOfSpcAddress[1]).to.equal(tokenAddresses[2]);
            // 2番目のトークンのみ、SPCアドレスがtmpAddressで登録されていること
            const addressesOfTmpAddress = await context.suite.trexFactory.getSecurityTokens(tmpAddress.address);
            expect(await addressesOfTmpAddress.length).to.equal(1);
            expect(await addressesOfTmpAddress[0]).to.equal(tokenAddresses[1]);
        }

        // [異常系] ST公開（不正な実行者:owner,SPC以外のアドレス）
        it('[ERROR]release failure(invalid executor)', async function () {
            const { owner, spcAddress, tmpAddress, stReleaseContract } = await loadFixture(deployContracts);
            await (await stReleaseContract.initialize()).wait(); // setTrexGateway無し

            // 事前準備
            const stReleaseParams: StReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address
            };

            // 異常終了確認
            try {
                await stReleaseContract.connect(tmpAddress).release(stReleaseParams);
                assert.fail();
            } catch (error: any) {
                // errorを正常に取得できないため、手動パースする
                const iface = new Interface(["error InvalidExecutor(address)"]);
                const decodedError = iface.parseError(error.data.data);
                expect(decodedError.name).to.equal('InvalidExecutor');
                expect(decodedError.args[0]).to.equal(tmpAddress.address);
            }
        });

        // [異常系] ST公開（setTrexGateway無し）
        it('[ERROR]release failure(without setTrexGateway)', async function () {
            const { owner, spcAddress, tmpAddress, stReleaseContract } = await loadFixture(deployContracts);
            await (await stReleaseContract.initialize()).wait(); // setTrexGateway無し

            // 事前準備
            const stReleaseParams: StReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address
            };

            // 異常終了確認
            try {
                await stReleaseContract.release(stReleaseParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('InvalidTrexGatewayAddress("0x0000000000000000000000000000000000000000")');
            }
        });

        // [異常系] ST公開（シンボルの重複登録）
        it('[ERROR]release failure(duplicated symbol)', async function () {
            const { owner, spcAddress, tmpAddress, stReleaseContract, context } = await loadFixture(setupContracts);

            // 事前準備
            const stReleaseParams: StReleaseParams = {
                symbol: 'TEST_SYMBOL', spcAddress: spcAddress.address
            };

            // 1度目は正常、2度目で異常終了
            expect((await (await stReleaseContract.release(stReleaseParams)).wait()).status).to.equal(TX_SUCCESS);

            // 異常終了確認
            try {
                await stReleaseContract.release(stReleaseParams);
                assert.fail();
            } catch (error: any) {
                expect(error.message).to.include('TokenAlreadyDeployed');
            }
        });
    });
});
