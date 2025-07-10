// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from  "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IYamanekoNFT} from "./interface/IYamanekoNFT.sol";
import {IJuglToken} from "./interface/IJuglTken.sol";
// import {console} from "hardhat/console.sol";

contract YamanekoMarketplace is
    Initializable,
    EIP712Upgradeable,
    Ownable2StepUpgradeable, 
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant BUYER_ROLE = keccak256('BUYER_ROLE');

    string private constant SIGNING_DOMAIN = "Yamaneko-Voucher";
    string private constant SIGNATURE_VERSION = "1";
    uint256 public constant UNITS = 10 ** 8;
    // uint256 public constant DECIMAL = 10 ** 18;
    bytes32 public constant MARKETITEM_TYPEHASH = keccak256(
    "MarketItemVoucher(address buyer,address seller,address creator,uint256 tokenId,uint256 contentsId,uint256 price,uint256 nonce)"
    );

    address public marketSignerAddress;
    uint256 public creatorFee;
    uint256 public platformFee;
    mapping(bytes => bool) public usedSignatures;

    IYamanekoNFT public nftContract;
    IJuglToken public paymentToken;

    // Events
    event PurchaseEvent(
        address indexed buyer,
        address indexed seller,
        address creator,
        uint256 tokenId,
        uint256 contentsId,
        uint256 amount,
        address operatoer
    );

    event WithdrawProceedsEvent(
      uint256 amount,
      address indexed owner
   );

    // Structs
   struct MarketItemVoucher{
      address buyer;
      address seller;
      address creator;
      uint256 tokenId;
      uint256 contentsId;
      uint256 price;
      uint256 nonce;
      bytes signature;
    }

    struct TokenPermitVoucher{
        address owner;
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // Modifiers
    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, _msgSender()), 'Caller is not a admin');
        _;
    }
    modifier onlyBuyer() {
        require(hasRole(BUYER_ROLE, _msgSender()), 'Caller is not a buyer');
        _;
    }

     function initialize() public initializer {
        __EIP712_init(SIGNING_DOMAIN, SIGNATURE_VERSION);
        __ReentrancyGuard_init();
        // __Ownable2Step_init();
        __Ownable_init(msg.sender);
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);

        creatorFee = 5000000;  //0.05 * UNITS = 5%
        platformFee = 5000000;  //0.05 * UNITS = 5%
    }

    // internal
    function _authorizeUpgrade(address) internal override onlyOwner {}

    // onlyAdmin
    function setNFTContract(address _nftAddress) external onlyAdmin {
        nftContract = IYamanekoNFT(_nftAddress);
    }

    function setPaymentToken(address _paymentTokenAddress) external onlyAdmin {
        paymentToken = IJuglToken(_paymentTokenAddress);
    }

    function setMarketSignerAddress(address _signerAddress) external onlyAdmin {
        marketSignerAddress = _signerAddress;
    }

    function setCreatorFeePercentage(uint256 _fee) external onlyAdmin {
        creatorFee = _fee;
    }

    function setPlatformFeePercentage(uint256 _fee) external onlyAdmin {
        platformFee = _fee;
    }

    // onlyOwner
    function withdrawProceeds() payable external nonReentrant onlyOwner{
        uint256 amount = paymentToken.balanceOf(address(this));
        require(amount > 0, "Insufficient Error");

        paymentToken.transfer(msg.sender, amount);
        emit WithdrawProceedsEvent(amount, msg.sender);
   }

    // onlyBuyer
    function buyNFT(MarketItemVoucher calldata voucher,TokenPermitVoucher calldata permit) external nonReentrant onlyBuyer {
        require(voucher.buyer != address(0),'Invalid address');
        require(voucher.seller != address(0),'Invalid address');
        require(voucher.creator != address(0),'Invalid address');
        require(voucher.seller != voucher.buyer,"Invalid buyer address");
        require(voucher.tokenId != 0,'Invalid tokenId');
        require(voucher.price != 0, 'Price is not Zero');
        require(!usedSignatures[voucher.signature], "Signature already used");

        // token verify
        address owner = nftContract.ownerOf(voucher.tokenId);
        require( owner == voucher.seller,"Invalid seller address");
        uint256 setTokenId = nftContract.getSBTonBattleNFT(owner,voucher.contentsId);
        require(setTokenId != voucher.tokenId,"This NFT has SBT set");

        // signature verify
        address signer = _marketItemVerify(voucher);
        require(signer == marketSignerAddress, "Invalid signature");

        // token transfer
        IJuglToken(address(paymentToken)).permit(
            permit.owner, address(this), permit.value, permit.deadline, permit.v, permit.r, permit.s);
        paymentToken.transferFrom(permit.owner, address(this), permit.value);

        // distribution of funds
        uint256 platformFeeAmount = voucher.price * platformFee / UNITS;
        uint256 creatorFeeAmount = voucher.price * creatorFee / UNITS;
        uint256 sellerAmount = voucher.price - platformFeeAmount - creatorFeeAmount;

        paymentToken.transfer(voucher.creator, creatorFeeAmount);
        paymentToken.transfer(voucher.seller, sellerAmount);
        
        // nft transfer
        nftContract.safeTransferFrom(voucher.seller, voucher.buyer, voucher.tokenId);
        
        usedSignatures[voucher.signature] = true;
        emit PurchaseEvent(
            voucher.buyer, voucher.seller, voucher.creator, voucher.tokenId, voucher.contentsId, voucher.price,msg.sender
        );
    }

    function _marketItemVerify(MarketItemVoucher calldata voucher) internal view returns (address) {
      bytes32 digest = _marketItemVoucherHash(voucher);
      return ECDSA.recover(digest, voucher.signature);
   }  

    function _marketItemVoucherHash(MarketItemVoucher calldata voucher) internal view returns (bytes32) {
      return _hashTypedDataV4(keccak256(abi.encode(
      MARKETITEM_TYPEHASH,
      voucher.buyer,
      voucher.seller,
      voucher.creator,
      voucher.tokenId,
      voucher.contentsId,
      voucher.price,
      voucher.nonce
      )));
   } 
}