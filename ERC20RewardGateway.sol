// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ERC20RewardGateway
 * @dev 当コントラクトは、ERC20トークンの報酬を安全かつ管理された方法で分配するためのものです。
 * 複数の送金をバッチ処理で実行し、クレームIDハッシュを使用して二重支払いを防止します。
 *
 * 役割:
 * - VERIFIER_ROLE: コントラクトの一時停止と解除を行う役割
 * - CONTROLLER_ROLE: コントラクトの一時停止を行う役割
 * - OPERATOR_ROLE: 報酬の送金を実行する役割
 *
 * 機能:
 * - 報酬プールから複数の受取人へのERC20トークンの安全な送金
 * - 効率的な分配のための送金バッチ機能
 * - ユニークなクレームIDハッシュを使用して二重支払いを防止
 */
contract ERC20RewardGateway is AccessControl, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant CONTROLLER_ROLE = keccak256("CONTROLLER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // custom error の定義
    error ArrayLengthMismatch(
        address tokenContract, 
        address rewardPoolContract, 
        address[] to, 
        uint256[] amount, 
        bytes32[] claimIdHash
    );
    error UnauthorizedCaller(address caller);

    // イベントの宣言
    event RewardTransfer(
        address indexed tokenContract,
        address indexed rewardPoolContract,
        address indexed to,
        uint256 amount,
        bytes32 claimIdHash
    );
    event TransferSkip(
        bytes32 indexed claimIdHash,
        address indexed to,
        uint256 amount
    );
    event SetTransactedClaimIdHash(bytes32 indexed claimIdHash, bool desired);

    mapping(bytes32 => bool) private transactedClaimIdHash;

    /**
     * @dev コントラクトのコンストラクタ。初期設定を行います。
     * @param _verifier 検証者のアドレス
     * @param _controller コントローラーのアドレス
     * @param _operator オペレーターのアドレス
     */
    constructor(
        address _verifier,
        address _controller,
        address _operator
    ) {
        _grantRole(VERIFIER_ROLE, _verifier);
        _grantRole(CONTROLLER_ROLE, _controller);
        _grantRole(OPERATOR_ROLE, _operator);
    }

    /**
     * @dev 報酬を指定されたアドレスに送金します。
     * クレームIDハッシュが既に処理済みの場合は、送金をスキップします。
     * @param _tokenContract トークンコントラクトのアドレス
     * @param _rewardPoolContract 報酬プール用スマートコントラクトのアドレス
     * @param _to 送金先アドレス
     * @param _amount 送金額
     * @param _claimIdHash クレームIDハッシュ
     */
    function transferReward(
        address _tokenContract,
        address _rewardPoolContract,
        address _to,
        uint256 _amount,
        bytes32 _claimIdHash
    ) public onlyRole(OPERATOR_ROLE) whenNotPaused {
        if (transactedClaimIdHash[_claimIdHash]) {
            emit TransferSkip(_claimIdHash, _to, _amount);
        } else {
          transactedClaimIdHash[_claimIdHash] = true;
          IERC20(_tokenContract).safeTransferFrom(
            _rewardPoolContract,
            _to,
            _amount
            );
            emit RewardTransfer(
                _tokenContract,
                _rewardPoolContract,
                _to,
                _amount,
                _claimIdHash
            );
            emit SetTransactedClaimIdHash(_claimIdHash, true);
        }
    }

    /**
     * @dev 一括送金を実行します。複数の受取人に対して報酬を配布します。
     * @param _tokenContract トークンコントラクトのアドレス
     * @param _rewardPoolContract 報酬プール用スマートコントラクトのアドレス
     * @param _to 送金先アドレスの配列
     * @param _amount 送金額の配列
     * @param _claimIdHash クレームIDハッシュの配列
     */
     function batchTransferReward(
        address _tokenContract,
        address _rewardPoolContract,
        address[] memory _to,
        uint256[] memory _amount,
        bytes32[] memory _claimIdHash
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
      if (_to.length != _amount.length || _to.length != _claimIdHash.length) {
        revert ArrayLengthMismatch(_tokenContract, _rewardPoolContract, _to, _amount, _claimIdHash);
      }

      for (uint256 i = 0; i < _to.length; i++) {
        transferReward(
            _tokenContract,
            _rewardPoolContract,
            _to[i],
            _amount[i],
            _claimIdHash[i]
        );
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
