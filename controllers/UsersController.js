const redisClient = require('../utils/redis').default;
const dbClient = require('../utils/db').default;
const sha1 = require('sha1');
const { ObjectId } = require('mongodb');

const postNew = async (req, res) => {
    const { email, password } = req.body;
    try {
        if (!email) {
            return res.status(400).json({
                error: 'Missing email'
            });
        } else if (!password) {
            return res.status(400).json({
                error: 'Missing password'
            });
        } else {
            const emailExist = await dbClient.db.collection('users').findOne({ email: email });
            if (emailExist) {
                return res.status(400).json({
                    error: 'Already exist'
                });
            } else {
                const hashedPassword = sha1(password);
                const newBody = {
                    email: email,
                    password: hashedPassword
                };
                const newUser = await dbClient.db.collection('users').insertOne(newBody);
                
                // Retrieve the inserted user document with only the email and _id fields
                const insertedUser = await dbClient.db.collection('users').findOne({ _id: newUser.insertedId }, { projection: { email: 1, _id: 1 } });
                
                return res.status(201).json(insertedUser);
            }
        }
    } catch (err) {
        return res.status(500).json({
            error: err.message
        });
    }
};

const getMe = async(req, res) => {
    const token = req.header('X-Token')
    if (!token) {
        return res.status(401).json({
            error: 'Unauthorized'
        });
    }
    try{
        const userId = await redisClient.get(`auth_${token}`)
        if(!userId){
            return res.status(401).json({
                error: 'Unauthorized'
            });
        }
        const findUser = await dbClient.db.collection('users').findOne({_id: ObjectId(userId)})
        if(!findUser){
            return res.status(401).json({
                error: 'Unauthorized'
            });
        }
        // Retrieve the inserted user document with only the email and _id fields
        const insertedUser = await dbClient.db.collection('users').findOne({ _id: findUser._id }, { projection: { email: 1, _id: 1 } });
        return res.status(200).json(insertedUser);

    } catch(err){
        return res.status(500).json({
            error: err.message
        });
    }
}

module.exports = { postNew, getMe };
