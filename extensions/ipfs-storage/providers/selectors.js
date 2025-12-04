// Copy of filesystem selectors for extension use
// Extensions can't access core modules via relative paths

class NodePathSelector {
    constructor(path) {
        this.value = path;
    }
}

class NodeUIDSelector {
    constructor(uid) {
        this.value = uid;
    }
}

module.exports = {
    NodePathSelector,
    NodeUIDSelector,
};
