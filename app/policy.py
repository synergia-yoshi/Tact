from __future__ import annotations

from typing import Literal

from app.auth import AuthContext

PolicyOperation = Literal[
    "publish.approve",
    "publish.reject",
    "budget.change",
    "legal.override",
    "audit.verify",
    "kill_switch.evaluate",
    "kill_switch.stop",
]

POLICY_MATRIX: dict[PolicyOperation, frozenset[str]] = {
    "publish.approve": frozenset({"approver", "admin"}),
    "publish.reject": frozenset({"approver", "admin"}),
    "budget.change": frozenset({"approver", "admin"}),
    "legal.override": frozenset({"admin"}),
    "audit.verify": frozenset({"admin"}),
    "kill_switch.evaluate": frozenset({"operator", "approver", "admin"}),
    "kill_switch.stop": frozenset({"approver", "admin"}),
}


class PolicyViolationError(PermissionError):
    def __init__(self, operation: PolicyOperation, required_roles: frozenset[str]) -> None:
        self.operation = operation
        self.required_roles = required_roles
        super().__init__(
            f"{operation} requires one of roles: {', '.join(sorted(required_roles))}"
        )


def ensure_allowed(auth_context: AuthContext, operation: PolicyOperation) -> None:
    required_roles = POLICY_MATRIX[operation]
    if not set(auth_context.roles).intersection(required_roles):
        raise PolicyViolationError(operation, required_roles)
