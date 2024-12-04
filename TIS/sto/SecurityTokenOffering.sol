// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { AbstractUpgradeable } from "../common/AbstractUpgradeable.sol";
import { ITokenHolder } from "../holder/ITokenHolder.sol";
import { ITokenHolderFactory } from "../holder/ITokenHolderFactory.sol";
import { ISTLinkToken } from "../overrides/ISTLinkToken.sol";
import { ISecurityTokenOffering } from "./ISecurityTokenOffering.sol";

error IssuanceDisallowedToken(address tokenAddress);
error PurchaseUnauthorizedInvestor(address walletAddress, address tokenHolderAddress);
error InvalidSender(address senderAddress);
error SecurityTokenOfferingNotInitializes(address securityTokenAddress, address tokenHolderFactoryAddress);
error InvestorStillUnableToSend(address walletAddress, address tokenHolderAddress, uint64 timeCanSendAfter, uint64 currentTimestamp);
error InvestorStillUnableToReceive(address walletAddress, address tokenHolderAddress, uint64 timeCanReceiveAfter, uint64 currentTimestamp);
error InvalidAddress(address targetAddress, string message);
error InvalidAmount();
error NonRegisteredInvestor(address walletAddress, string message);
error InvestorKycExpired(uint256 blockTimestamp, uint256 kycExpiry, string message);

/**
 * @notice 前身のPolymathとの互換機能。セキュリティトークン単位で個別のコントラクトアドレスを持つ。
 * @dev ERC3643化に伴い不要化したパラメータも、互換確認のためコメントとして残す。
 */
contract SecurityTokenOffering is ISecurityTokenOffering, AbstractUpgradeable {
    // uint8 constant FUND_RAISE_TYPE_STLINK = 0;
    // mapping (uint8 => bool) public fundRaiseTypes;
    // mapping (uint8 => uint256) public fundsRaised;
    // -> raisedAmount

    // 投資家のウォレットアドレス => TokenHolderのコントラクトアドレス
    mapping (address => address) internal _allInvestorMap;

    string internal _symbol;
    address internal _spcAddress;
    // uint256 internal _startDate; // 不要パラメータ
    // uint256 internal _endDate; // 不要パラメータ
    // uint256 internal _cap; // (=tokenOnSale)不要パラメータ
    uint256 internal _rate;
    uint256 internal _raisedAmount;
    uint256 internal _soldTokensAmount;
    address[] internal _tokenHolders; // 当トークンのホルダのリスト（length=investorCount）
    // bool internal _isPaused;     // 不要パラメータ
    // bool internal _isFinalized;  // 不要パラメータ

    address internal _securityTokenAddress;
    address internal _tokenHolderFactoryAddress;

    // 呼出元が「ownerが同一のコントラクト」でない場合revert
    modifier onlyController() {
        address senderAddress = _msgSender();
        if (senderAddress.code.length == 0
                || AbstractUpgradeable(senderAddress).owner() != owner()) {
            revert InvalidSender(senderAddress);
        }
        _;
    }

    /**
     * @notice STOを初期化する
     * @param symbol_ トークンのシンボル
     * @param spcAddress_ SPCのウォレットアドレス
     * @param rate_ STOのレート
     * @param securityTokenAddress_ セキュリティトークンのアドレス
     * @param tokenHolderFactoryAddress_ トークンホルダファクトリのアドレス
     */
    function initialize(
        string calldata symbol_,
        address spcAddress_,
        // uint256 startDate_,
        // uint256 endDate_,
        // uint256 cap_,
        uint256 rate_,
        // uint8 fundRaiseType_,
        // bool isPaused_,
        // bool isFinalized_,
        address securityTokenAddress_,
        address tokenHolderFactoryAddress_
    ) external initializer {
        validateAddress(spcAddress_, "spc");
        validateAddress(securityTokenAddress_, "securityToken");
        validateAddress(tokenHolderFactoryAddress_, "tokenHolderFactory");
        __AbstractUpgradeable_init();

        // fundRaiseType[fundRaiseType_] = true;
        // fundsRaised[fundRaiseType_] = 0;
        // _raisedAmount = 0;
        // _soldTokensAmount = 0;

        _symbol = symbol_;
        _spcAddress = spcAddress_;
        // _startDate = startDate_;
        // _endDate = endDate_;
        // _cap = cap_;
        _rate = rate_;
        // _isPaused = false;
        // _isFinalized = false;
        _securityTokenAddress = securityTokenAddress_;
        _tokenHolderFactoryAddress = tokenHolderFactoryAddress_;

        // TresuryWallet（SPCアドレス）のIdentity（mint用）を生成し、SPC自身をホルダの初期管理キーに設定
        address spcTokenHolderAddress = ITokenHolderFactory(tokenHolderFactoryAddress_).create(spcAddress_, address(this));
        _allInvestorMap[spcAddress_] = spcTokenHolderAddress;
        // 生成したIdentityをトークンのIdentityRegistryに登録
        ISTLinkToken(securityTokenAddress_).identityRegistry().registerIdentity(
                spcAddress_, ITokenHolder(spcTokenHolderAddress).onchainId(), 0);
        ITokenHolder(spcTokenHolderAddress).update(
                ITokenHolder.TokenHolderParams({
                        symbol: symbol_,
                        spcAddress: spcAddress_,
                        walletAddress: spcAddress_,
                        timeCanReceiveAfter: 0,
                        timeCanSendAfter: 0,
                        kycExpiry: type(uint64).max,
                        canBuyFromSto: true
                })
        );

        // トークンの初期化（休止状態の解除、mint可能な状態、SPCのトークンホルダを設定）
        ISTLinkToken token = ISTLinkToken(securityTokenAddress_);
        token.unpause();
        token.setIssuanceAllowed(true);
        token.setTreasuryTokenHolder(spcTokenHolderAddress);
    }

    /**
     * @notice このSTOで取引するトークンホルダの情報を追加/更新する
     * @param params TokenHolderParams
     * @return トークンホルダのコントラクトアドレス
     */
    function modifyTokenHolder(ITokenHolder.TokenHolderParams calldata params)
            external virtual whenNotPaused onlyController returns (address) {
        validatePhase();
        validateAddress(params.walletAddress, "params.walletAddress");

        // 登録済みのトークンホルダを取得し、未登録であれば生成
        address holderAddress = _allInvestorMap[params.walletAddress];
        if (holderAddress == address(0)) {
            // Identityを管理するトークンホルダを生成し、SPCをトークンホルダの初期管理キーに設定
            holderAddress = ITokenHolderFactory(_tokenHolderFactoryAddress).create(params.spcAddress, address(this));
            _allInvestorMap[params.walletAddress] = holderAddress;
            // 生成したIdentityをトークンのIdentityRegistryに登録
            ISTLinkToken(_securityTokenAddress).identityRegistry().registerIdentity(
                    params.walletAddress, ITokenHolder(holderAddress).onchainId(), 0);
        }
        ITokenHolder(holderAddress).update(params);
        return holderAddress;
    }

    /**
     * @notice STOにてセキュリティトークンを購入する
     * @param tokenHolderAddress トークンホルダのコントラクトアドレス
     * @param amount トークン購入量
     */
    function purchase(address tokenHolderAddress, uint256 amount) external virtual whenNotPaused onlyController {
        validatePhase();
        validateAmount(amount);
        // require(block.timestamp >= _startDate && block.timestamp <= _endDate, "STO is not active");
        // require(_raisedAmount + amount <= _cap, "Cap reached");
        validateAddress(tokenHolderAddress, "tokenHolder");

        ISTLinkToken token = ISTLinkToken(_securityTokenAddress);
        if (!token.isIssuanceAllowed()) {
            revert IssuanceDisallowedToken(address(token));
        }

        ITokenHolder holder = ITokenHolder(tokenHolderAddress);
        validateTokenHolder(holder, "tokenHolder");
        if (!holder.canBuyFromSto()) {
            revert PurchaseUnauthorizedInvestor(holder.walletAddress(), tokenHolderAddress);
        }

        // raisedAmount は通貨単位（POLY/ETH）での発行量だが、Polymathの廃止に伴い総量と同値で管理
        uint256 purchaseAmount = amount * _rate;
        _raisedAmount += purchaseAmount;
        _soldTokensAmount += purchaseAmount;

        // 投資家数を調整しトークン発行：TresuryWallet（投資家が未保有のトークンの格納庫）としてSPCアドレスに発行してから移転
        incrementTokenHolders(token, holder);
        token.mint(holder.spcAddress(), purchaseAmount);
        token.addAllowance(holder.spcAddress(), purchaseAmount);
        token.transferFrom(holder.spcAddress(), holder.walletAddress(), purchaseAmount);
    }

    /**
     * @notice STOにてセキュリティトークンを移転する
     * @param fromAddress 移転元TokenHolderのコントラクトアドレス
     * @param toAddress 移転先TokenHolderのコントラクトアドレス
     * @param amount トークン移転量
     */
    function transfer(address fromAddress, address toAddress, uint256 amount) external virtual whenNotPaused onlyController {
        uint64 currentTimestamp = uint64(block.timestamp);
        
        validatePhase();
        // require(block.timestamp >= _startDate && block.timestamp <= _endDate, "STO is not active");
        validateAddress(fromAddress, "fromAddress");
        validateAddress(toAddress, "toAddress");

        // 移転元精査
        ITokenHolder fromHolder = ITokenHolder(fromAddress);
        validateTokenHolder(fromHolder, "fromHolder");
        if(fromHolder.timeCanSendAfter() > currentTimestamp) {
            revert InvestorStillUnableToSend(fromHolder.walletAddress(), fromAddress, fromHolder.timeCanSendAfter(), currentTimestamp);
        }

        // 移転先精査
        ITokenHolder toHolder = ITokenHolder(toAddress);
        validateTokenHolder(toHolder, "toHolder");
        if(toHolder.timeCanReceiveAfter() > currentTimestamp) {
            revert InvestorStillUnableToReceive(toHolder.walletAddress(), toAddress, toHolder.timeCanReceiveAfter(), currentTimestamp);
        }

        // 投資家数を調整しトークン移転
        ISTLinkToken token = ISTLinkToken(_securityTokenAddress);
        decrementTokenHolders(token, fromHolder, amount);
        incrementTokenHolders(token, toHolder);
        token.addAllowance(fromHolder.walletAddress(), amount);
        token.transferFrom(fromHolder.walletAddress(), toHolder.walletAddress(), amount);
    }

    /**
     * @notice STOにてセキュリティトークンを強制移転する
     * @dev トークンホルダの属性精査・トークンの凍結判定をスキップして移転
     * @param fromAddress 移転元TokenHolderのコントラクトアドレス
     * @param toAddress 移転先TokenHolderのコントラクトアドレス
     * @param amount トークン移転量
     */
    function forcedTransfer(address fromAddress, address toAddress, uint256 amount) external virtual onlyController {
        validatePhase();
        validateAddress(fromAddress, "fromAddress");
        validateAddress(toAddress, "toAddress");

        ITokenHolder fromHolder = ITokenHolder(fromAddress);
        ITokenHolder toHolder = ITokenHolder(toAddress);

        // 投資家数を調整しトークンを強制移転
        ISTLinkToken token = ISTLinkToken(_securityTokenAddress);
        decrementTokenHolders(token, fromHolder, amount);
        incrementTokenHolders(token, toHolder);
        token.forcedTransfer(fromHolder.walletAddress(), toHolder.walletAddress(), amount);
    }

    /**
     * @notice STOにてセキュリティトークンを償還する
     * @param tokenHolderAddress トークンホルダのコントラクトアドレス
     * @param amount トークン償還量
     */
    function redeem(address tokenHolderAddress, uint256 amount) external virtual whenNotPaused onlyController {
        validatePhase();
        validateAddress(tokenHolderAddress, "tokenHolder");

        ITokenHolder holder = ITokenHolder(tokenHolderAddress);
        // Polymathの仕様（KYCでのエラーを無視して強制償還）を踏襲し、償還元精査は実施しない
        // validateTokenHolder(holder, "tokenHolder");

        // 投資家数を調整しトークン償還
        ISTLinkToken token = ISTLinkToken(_securityTokenAddress);
        decrementTokenHolders(token, holder, amount);
        token.burn(holder.walletAddress(), amount);
    }

    /**
     * @notice STOとして保持する属性値を取得する
     * @return STO属性情報
     */
    function value() external virtual view returns(StoAttributes memory) {
        return StoAttributes (
            _symbol,
            //// _startDate,
            //// _endDate,
            //// _cap,
            _rate,
            _raisedAmount,
            _soldTokensAmount,
            _tokenHolders.length,
            //// _isPaused,
            //// _isFinalized,
            address(this)
        );
    }

    /**
     * @notice STOとして保持する全トークンホルダを取得する
     */
    function allTokenHolders() external virtual view returns(address[] memory) {
        return _tokenHolders;
    }

    /**
     * @notice 投資家のウォレットアドレスからトークンホルダのコントラクトアドレスを取得する
     * @param investorWallet 投資家のウォレットアドレス
     * @return トークンホルダのコントラクトアドレス
     */
    function tokenHolder(address investorWallet) external virtual view returns (address) {
        return _allInvestorMap[investorWallet];
    }

    /**
     * @notice STOの状態を精査（未初期化の場合エラー）
     */
    function validatePhase() internal virtual view {
        if(_securityTokenAddress == address(0) || _tokenHolderFactoryAddress == address(0)) {
            revert SecurityTokenOfferingNotInitializes(_securityTokenAddress, _tokenHolderFactoryAddress);
        }
        //// require(!_isFinalized, "STO is finalized");
    }

    /**
     * @notice トークンの取引量を精査（0の場合エラー）
     */
    function validateAmount(uint256 amount) internal virtual pure {
        if(amount == 0) {
            revert InvalidAmount();
        }
    }

    /**
     * @notice アドレスを精査（address(0)の場合エラー）
     * @param target 精査対象のアドレス
     * @param message エラー時の識別メッセージ
     */
    function validateAddress(address target, string memory message) internal virtual pure {
        if(target == address(0)) {
            revert InvalidAddress(target, message);
        }
    }

    /**
     * @notice トークンホルダを精査（STOで未取扱い or KYC有効期限切れの場合エラー）
     * @param holder 精査対象のトークンホルダ
     * @param message エラー時の識別メッセージ
     */
    function validateTokenHolder(ITokenHolder holder, string memory message) internal virtual view {
        if(_allInvestorMap[holder.walletAddress()] == address(0)) {
            revert NonRegisteredInvestor(holder.walletAddress(), message);
        }
        if(block.timestamp > holder.kycExpiry()) {
            revert InvestorKycExpired(block.timestamp, holder.kycExpiry(), message);
        }
    }

    /**
     * @notice 発行や移転で保有量がゼロから増える投資家をホルダリストに追加する
     * @param token セキュリティトークン
     * @param holder トークンホルダのコントラクトアドレス
     */
    function incrementTokenHolders(ISTLinkToken token, ITokenHolder holder) internal virtual {
        if (token.balanceOf(holder.walletAddress()) == 0) {
            _tokenHolders.push(address(holder));
        }
    }

    /**
     * @notice 移転や償還で保有量がゼロになる投資家をホルダリストから削除する
     * @param token セキュリティトークン
     * @param holder トークンホルダのコントラクトアドレス
     * @param amount これから減算するトークン量
     */
    function decrementTokenHolders(ISTLinkToken token, ITokenHolder holder, uint256 amount) internal virtual {
        if (token.balanceOf(holder.walletAddress()) == amount) {
            // 削除対象の位置の値を最後の要素で上書きし、最後の要素を減らす
            for (uint256 i = 0; i < _tokenHolders.length;) {
                if (_tokenHolders[i] == address(holder)) {
                    _tokenHolders[i] = _tokenHolders[_tokenHolders.length - 1];
                    _tokenHolders.pop();
                    break;
                }
                unchecked { i++; }
            }
        }
    }
}
