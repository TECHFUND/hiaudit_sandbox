// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {ITokenURI} from "./interface/ITokenURI.sol";

contract YamanekoSBT is
    Initializable,
    ERC721Upgradeable,
    Ownable2StepUpgradeable, 
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');
    bytes32 public constant MINTER_ROLE = keccak256('MINTER_ROLE');
    bytes32 public constant SETTER_ROLE = keccak256('SETTER_ROLE');

    uint256 public switchURI;
    ITokenURI public tokenuri;
    string public fixMetadata;
    string public baseURI;
    string public baseExtension;

    uint256 public tokenIdCnt;

    // tokenId -> targetContentId
    mapping(uint256 => uint256) private _tokenContents;
    // address -> contentsId -> tokenId
    mapping(address => mapping(uint256 => uint256)) private _addressContentsTokens;
    // SBTtokenID -> BattleNFTtokenID
    mapping(uint256 => uint256) private _tokenBattleNFTs;

    // Events
    event SBTMintEvent(
        address indexed recipient,
        uint256 tokenId,
        uint256 contentsId,
        address operatoer
    );

    event SetSwitchURIEvent(
        uint256 indexed switchURI
    );

    event SetTokenURIEvent(
        address indexed tokenuri
    );

    event SetFixMetadataEvent(
        string fixMetadata
    );

    event SetBaseURIEvent(
        string baseURI
    );

    event SetBaseExtensionEvent(
        string baseExtension
    );

    event SetTokenBattleNFTEvent(
        address indexed owner,
        uint256 tokenId,
        uint256 battleNFTId,
        address operatoer
    );

    // Modifiers
    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, _msgSender()), 'Caller is not a admin');
        _;
    }
    modifier onlyMinter() {
        require(hasRole(MINTER_ROLE, _msgSender()), 'Caller is not a minter');
        _;
    }
    modifier onlySetter() {
        require(hasRole(SETTER_ROLE, _msgSender()), 'Caller is not a setter');
        _;
    }

     function initialize() public initializer {
        __ERC721_init("Yamaneko-SBT", "YNKSBT");
        __ReentrancyGuard_init();
        // __Ownable2Step_init();
        __Ownable_init(msg.sender);
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(SETTER_ROLE, msg.sender);

        tokenIdCnt = 1;
        baseExtension = ".json";
    }

    // internal
    function _authorizeUpgrade(address) internal override onlyOwner {}

    // onlyMinter
    function mint(address to,uint256 contentsId) external nonReentrant onlyMinter {
        require(contentsId != 0, "contentsId is not 0");
        require(_addressContentsTokens[to][contentsId] == 0, "This address already has this contentsId");
        _safeMint(to, tokenIdCnt);
        _tokenContents[tokenIdCnt] = contentsId;
        _addressContentsTokens[to][contentsId] = tokenIdCnt;

        emit SBTMintEvent(to, tokenIdCnt, contentsId, msg.sender);

        tokenIdCnt++;
    }

    // onlyAdmin
    function setSwitchURI(uint256 _switchURI) external onlyAdmin {
        switchURI = _switchURI;
        emit SetSwitchURIEvent(_switchURI);
    }

    function setTokenURI(address _tokenuri) external onlyAdmin {
        tokenuri = ITokenURI(_tokenuri);
        emit SetTokenURIEvent(_tokenuri);
    }

    function setFixMetadata(string memory _data) external onlyAdmin {
        fixMetadata = _data;
        emit SetFixMetadataEvent(_data);
    }

    function setBaseURI(string memory _data) external onlyAdmin {
        baseURI = _data;
        emit SetBaseURIEvent(_data);
    }

    function setBaseExtension(string memory _data) external onlyAdmin {
        baseExtension = _data;
        emit SetBaseExtensionEvent(_data);
    }

    // onlySetter
    function setTokenBattleNFT(uint256 tokenId, uint256 battleNFTId) external onlySetter {
        _tokenBattleNFTs[tokenId] = battleNFTId;
        emit SetTokenBattleNFTEvent(ownerOf(tokenId), tokenId, battleNFTId, msg.sender);
    }

    // View functions
    function getBattleNFT(uint256 tokenId) external view returns (uint256) {
        // Obtains the token ID of the loaded opponent NFT from the token ID (0 if not loaded)
        return _tokenBattleNFTs[tokenId];
    }

    function getTokenId(uint256 contentsId, address owner) external view returns (uint256) {
        // Returns the token ID by specifying the contents ID and address(check already own SBT)
        return _addressContentsTokens[owner][contentsId];
    }

    function getContentsId(uint256 tokenId) external view returns (uint256) {
        // You can get the contents ID from the token ID
        return _tokenContents[tokenId];
    }

    // override
    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    // for SBT
    function _update(address to, uint256 tokenId, address auth)
        internal override returns (address) {
        address from = super._ownerOf(tokenId);
        require(from == address(0), "Token is not transferable");

        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public virtual override {
        require(false,"This token is SBT");
    }

    function setApprovalForAll(address, bool) public virtual override {
        require(false,"This token is SBT");
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(ownerOf(tokenId) != address(0), "ERC721Metadata: URI query for nonexistent token");

        if(switchURI == 0) {
            // fixMetadata
            return fixMetadata;
        } else {
            if(address(tokenuri) == address(0)){
                // ERC721 baseURI
                return string(abi.encodePacked(ERC721Upgradeable.tokenURI(tokenId), baseExtension));
            }else{
                // Custom tokenURI
                return tokenuri.tokenURI_variable(tokenId);
            } 
        }
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override (AccessControlUpgradeable,ERC721Upgradeable) returns (bool) {
        return ERC721Upgradeable.supportsInterface(interfaceId) || AccessControlUpgradeable.supportsInterface(interfaceId);
    }
}