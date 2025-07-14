// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title DM2TradeRewardPool
 * @dev 当コントラクトは報酬プールを管理し、報酬の登録、送金用スマートコントラクトの設定、トークンの引き出し機能を提供します。
 */
contract DM2TradeRewardPool is AccessControl, Pausable {
    using SafeERC20 for IERC20;

    // 送金用スマートコントラクトのアドレス
    address public rewardGateway;

    // 引き出し先アドレス
    address public withdrawRecipient;

    // アクセスコントロール用のロール定義
    bytes32 public constant CONTROLLER_ROLE = keccak256("CONTROLLER_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    // カスタムエラーの定義
    error UnauthorizedCaller(address caller);

    // イベントの宣言
    event ApproveEvent(
        string indexed treventID,
        address indexed tokenContract,
        address indexed rewardGateway,
        uint256 previousAllowance,
        uint256 newAllowance,
        uint256 rewardAmount
    );

    /**
        * @dev コントラクトのコンストラクタ。初期設定を行います。
        * @param _rewardGateway 送金用スマートコントラクトのアドレス
        * @param _withdrawRecipient 引き出し先のアドレス
        * @param _controller コントローラーのアドレス
        * @param _verifier 検証者のアドレス
        */
    constructor(
        address _rewardGateway,
        address _withdrawRecipient,
        address _controller,
        address _verifier
    ) {
        rewardGateway = _rewardGateway;
        withdrawRecipient = _withdrawRecipient;
        _grantRole(CONTROLLER_ROLE, _controller);
        _grantRole(VERIFIER_ROLE, _verifier);
    }

    /**
        * @dev 報酬トークンを設定し、送金用スマートコントラクトに承認を与えます。
        * @param _treventID トークン報酬イベントID
        * @param _tokenContract トークンコントラクトのアドレス
        * @param _rewardAmount 報酬合計金額
        */
    function registerEvent(
        string calldata _treventID,
        address _tokenContract,
        uint256 _rewardAmount
    ) external onlyRole(CONTROLLER_ROLE) whenNotPaused {
        uint256 previousAllowance = IERC20(_tokenContract).allowance(address(this), rewardGateway);
        uint256 newAllowance = previousAllowance + _rewardAmount;
        
        // `safeIncreaseAllowance` を使用して許可を増加させます。
        IERC20(_tokenContract).safeIncreaseAllowance(rewardGateway, _rewardAmount);
        
        emit ApproveEvent(_treventID, _tokenContract, rewardGateway, previousAllowance, newAllowance, _rewardAmount);
    }

    /**
        * @dev 送金用スマートコントラクトのアドレスを設定します。
        * @param _newRewardGateway 新しい送金用スマートコントラクトのアドレス
        * @param _tokenContracts 許可をリセットするトークンのアドレス配列
        */
    function setRewardGateway(
        address _newRewardGateway,
        address[] calldata _tokenContracts
    ) external onlyRole(CONTROLLER_ROLE) whenNotPaused {
        address oldRewardGateway = rewardGateway;

        // 古い rewardGateway の許可をリセット
        _resetAllowanceForAllTokens(_tokenContracts, oldRewardGateway);

        // 新しい rewardGateway を設定
        rewardGateway = _newRewardGateway;

        pause();
    }

    /**
        * @dev 古い rewardGateway のすべてのトークンの許可をリセットする内部関数
        * @param _tokenContracts 許可をリセットするトークンのアドレス配列
        * @param _oldRewardGateway 古い rewardGateway のアドレス
        */
    function _resetAllowanceForAllTokens(
        address[] calldata _tokenContracts,
        address _oldRewardGateway
    ) internal {
        for (uint256 i = 0; i < _tokenContracts.length; i++) {
            IERC20(_tokenContracts[i]).forceApprove(_oldRewardGateway, 0);
        }
    }

    /**
     * @dev 引き出し先のアドレスを設定します。
     * @param _newWithdrawRecipient 新しい引き出し先のアドレス
     */
    function setWithdrawRecipient(address _newWithdrawRecipient)
        external onlyRole(CONTROLLER_ROLE) whenNotPaused {
        withdrawRecipient = _newWithdrawRecipient;
        pause();
    }

    /**
        * @dev 指定されたトークンを引き出します。
        * @param _tokenAddresses 引き出すトークンのアドレス配列
        */
    function withdraw(address[] calldata _tokenAddresses) external onlyRole(VERIFIER_ROLE) {
        for (uint256 i = 0; i < _tokenAddresses.length; i++) {
            uint256 balance = IERC20(_tokenAddresses[i]).balanceOf(address(this));
            IERC20(_tokenAddresses[i]).safeTransfer(withdrawRecipient, balance);
        }
    }

    /**
    * @dev コントラクトを一時停止します。
    */
    function pause() external onlyControllerOrVerifier {
        _pause();
    }

    /**
     * @dev 検証者のみがコントラクトの一時停止を解除します。
     */
    function unpause() external onlyRole(VERIFIER_ROLE) {
        _unpause();
    }

    /**
     * @dev コントローラーまたは検証者のみが呼び出せる modifier
     */
    modifier onlyControllerOrVerifier() {
        if (!hasRole(CONTROLLER_ROLE, msg.sender) && !hasRole(VERIFIER_ROLE, msg.sender)) {
            revert UnauthorizedCaller(msg.sender);
        }
        _;
    }
}
