"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasMinimumRole = hasMinimumRole;
const roleWeight = {
    viewer: 1,
    editor: 2,
    owner: 3
};
function hasMinimumRole(actual, required) {
    return roleWeight[actual] >= roleWeight[required];
}
