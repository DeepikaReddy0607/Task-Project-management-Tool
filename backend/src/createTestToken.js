import "dotenv/config";
import jwt from "jsonwebtoken";

const token = jwt.sign(
    {
        userId: "test-user-123",
        roleId: "test-role-123",
        role: "Admin"
    },
    process.env.JWT_SECRET,
    {
        expiresIn: "1h"
    }
);

console.log("\nTest JWT:\n");
console.log(token);
console.log("\n");