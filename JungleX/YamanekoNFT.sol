// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable}from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {ERC721URIStorageUpgradeable,ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from  "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IYamanekoSBT} from "./interface/IYamanekoSBT.sol";

contract YamanekoNFT is
    Initializable,
    EIP712Upgradeable,
    ERC721URIStorageUpgradeable,
    Ownable2StepUpgradeable, 
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant MINTER_ROLE = keccak256('MINTER_ROLE');
    bytes32 public constant BURNER_ROLE = keccak256('BURNER_ROLE');
    bytes32 public constant SETTER_ROLE = keccak256('SETTER_ROLE');

    bytes32 public constant APPROVALITEM_TYPEHASH = keccak256(
    "setApprovalForAll(address owner,address operator,bool approved,uint256 nonce,uint256 deadline)"
    );

    string private constant SIGNING_DOMAIN = "Yamaneko-Voucher";
    string private constant SIGNATURE_VERSION = "1";

    address public sbtAddress;
    address public marketplaceAddress;
    // tokenId -> targetContentId
    mapping(uint256 => uint256) private _tokenContents;

    // Events
    event NFTMintEvent(
        address indexed recipient,
        uint256 tokenId,
        uint256 contentsId,
        string uri,
        address operatoer
    );

    event NFTBurnEvent(
        address indexed recipient,
        uint256 tokenId,
        uint256 contentsId,
        address operatoer
    );

    event SetSBTAddressEvent(
        address indexed sbtAddress
    );

    event SetMarketplaceAddressEvent(
        address indexed marketplaceAddress
    );

    event SetSBTonNFTEvent(
        address indexed owner,
        uint256 tokenId,
        uint256 preTokenId,
        uint256 contentsId,
        uint256 sbtTokenId,
        address operatoer
    );

    event RemoveSBTonNFTEvent(
        address indexed owner,
        uint256 preTokenId,
        uint256 contentsId,
        uint256 sbtTokenId,
        address operatoer
    );

    // Structs
    struct ApprovePermitVoucher{
        address owner;
        address operator;
        bool approved;
        uint256 nonce;
        uint256 deadline;
        bytes signature;
    }

    // Modifiers
    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, _msgSender()), 'Caller is not a admin');
        _;
    }
    modifier onlyMinter() {
        require(hasRole(MINTER_ROLE, _msgSender()), 'Caller is not a minter');
        _;
    }
    modifier onlyBurner() {
        require(hasRole(BURNER_ROLE, _msgSender()), 'Caller is not a burner');
        _;
    }
    modifier onlySetter() {
        require(hasRole(SETTER_ROLE, _msgSender()), 'Caller is not a setter');
        _;
    }
    
    function initialize(address _sbtAddress) public initializer {
        __EIP712_init(SIGNING_DOMAIN, SIGNATURE_VERSION);
        __ERC721_init("Yamaneko", "YNK");
        __ReentrancyGuard_init();
        // __Ownable2Step_init();
        __Ownable_init(msg.sender);
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);
        _grantRole(SETTER_ROLE, msg.sender);

        sbtAddress = _sbtAddress;
        marketplaceAddress = address(0);    // Update later
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // onlyMinter
    function mint(address to, uint256 tokenId, uint256 contentsId, string calldata uri) external nonReentrant onlyMinter {
        require(_ownerOf(tokenId) == address(0), "tokenId already exists");
        require( to != address(0), "to is not 0 address");

        //mint
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        _tokenContents[tokenId] = contentsId;

        emit NFTMintEvent(to, tokenId, contentsId, uri, msg.sender);
    }

    // onlyBurner
    function burn(uint256 tokenId) external nonReentrant onlyBurner {
        require(_ownerOf(tokenId) != address(0), "tokenId does not exist");

        // burn
        _burn(tokenId);

        emit NFTBurnEvent(_ownerOf(tokenId), tokenId, _tokenContents[tokenId], msg.sender);
        delete _tokenContents[tokenId];  
    }

    // onlyAdmin
    function setSBTAddress(address _sbtAddress) external onlyAdmin {
        sbtAddress = _sbtAddress;
        emit SetSBTAddressEvent(_sbtAddress);
    }

    function setMarketplaceAddress(address _marketplaceAddress) external onlyAdmin {
        marketplaceAddress = _marketplaceAddress;
        emit SetMarketplaceAddressEvent(_marketplaceAddress);
    }

    // onlySetter
    function setSBTonNFT(address owner, uint256 tokenId, uint256 contentsId) external onlySetter {
        require(ownerOf(tokenId) == owner, "This tokenId is not owner's");
        require(_tokenContents[tokenId] == contentsId, "This tokenId is not contentsId's");

        uint256 sbtTokenId = IYamanekoSBT(sbtAddress).getTokenId(contentsId, owner);
        require(sbtTokenId != 0, "This owner does not have this contentsId");

        uint256 preTokenId = IYamanekoSBT(sbtAddress).getBattleNFT(sbtTokenId);
        IYamanekoSBT(sbtAddress).setTokenBattleNFT(sbtTokenId, tokenId);

        emit SetSBTonNFTEvent(owner, tokenId, preTokenId, contentsId, sbtTokenId, msg.sender);
    }

    function removeSBTonNFT(address owner, uint256 contentsId) external onlySetter {
        uint256 sbtTokenId = IYamanekoSBT(sbtAddress).getTokenId(contentsId, owner);
        uint256 preTokenId = IYamanekoSBT(sbtAddress).getBattleNFT(sbtTokenId);
        IYamanekoSBT(sbtAddress).setTokenBattleNFT(sbtTokenId, 0);

        emit RemoveSBTonNFTEvent(owner, preTokenId, contentsId, sbtTokenId, msg.sender);
    }

    // Execution of setApprovalForAll by signature
    function approvalPermit(ApprovePermitVoucher calldata voucher) external onlySetter {
        require(voucher.deadline >= block.timestamp, "Signature expired");

        // signature verify
        address signer =_permitItemVerify(voucher);
        require(signer == voucher.owner, "Invalid signature");

        _setApprovalForAll(voucher.owner, voucher.operator, voucher.approved);
    }

    function _permitItemVerify(ApprovePermitVoucher calldata voucher) internal view returns (address) {
      bytes32 digest = _permitItemVoucherHash(voucher);
      return ECDSA.recover(digest, voucher.signature);
    }  

    function _permitItemVoucherHash(ApprovePermitVoucher calldata voucher) internal view returns (bytes32) {
      return _hashTypedDataV4(keccak256(abi.encode(
        APPROVALITEM_TYPEHASH,
        voucher.owner,
        voucher.operator,
        voucher.approved,
        voucher.nonce,
        voucher.deadline
      )));
    } 

    // view
    function getSBTonBattleNFT(address owner, uint256 contentsId) public view returns (uint256) {
        uint256 sbtTokenId = IYamanekoSBT(sbtAddress).getTokenId(contentsId, owner);
        return IYamanekoSBT(sbtAddress).getBattleNFT(sbtTokenId);
    }

    function getContentsId(uint256 tokenId) external view returns (uint256) {
        return _tokenContents[tokenId];
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControlUpgradeable, ERC721URIStorageUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // YAMANEKO Can only be Approved by Marketplace
    function approve(address to, uint256 tokenId) public virtual override(ERC721Upgradeable, IERC721) {
        require(to == marketplaceAddress, "Caller is not a marketplace");
        super.approve(to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) public virtual override(ERC721Upgradeable, IERC721) {
        require(operator == marketplaceAddress, "Caller is not a marketplace");
        super.setApprovalForAll(operator, approved);
    }

    // TransferFrom is not possible if NFT is loading SBT
    function transferFrom(address from, address to, uint256 tokenId) public virtual override(ERC721Upgradeable, IERC721) {
        require(getSBTonBattleNFT(from, _tokenContents[tokenId]) != tokenId, "This NFT is on SBT");
        super.transferFrom(from, to, tokenId);
    }

}