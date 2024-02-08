const redisClient = require('../utils/redis').default;
const dbClient = require('../utils/db').default;

const getStatus = (req, res) => {
    if (dbClient.isAlive() && redisClient.isAlive()) {
        res.status(200).json({ "redis": true, "db": true });
    } else {
        res.status(500).json({ "error": "Database or Redis server is not alive" });
    }
};

const getStats = async (req, res) => {
    try {
        const users = await dbClient.nbUsers();
        const files = await dbClient.nbFiles();
        res.status(200).json({
            "users": users,
            "files": files
        });
    } catch (error) {
        res.status(500).json({ "error": "Error fetching stats" });
    }
};

module.exports = { getStatus, getStats };
