const express = require("express");
const bcrypt = require('bcryptjs');
const cors = require('cors');
const knex = require('knex');
const { ClarifaiStub, grpc } = require("clarifai-nodejs-grpc");
const PORT = process.env.PORT || 3000;

require('dotenv').config()

const db = knex({
    client: 'pg',
    connection: {
        host: process.env.PG_HOST,
        port: process.env.PG_PORT,
        user: process.env.PG_USER,
        password: process.env.PG_PWD,
        database: process.env.PG_DB
    }
});

const stub = ClarifaiStub.grpc();

const metadata = new grpc.Metadata();
metadata.set("authorization", `Key ${process.env.CLARIFAI_API_KEY}`);

const app = express();

app.use(express.json());
app.use(cors())

const handleApiCall = (req, res) => {
    stub.PostModelOutputs(
        {
            model_id: "a403429f2ddf4b49b307e318f00e528b",
            inputs: [{ data: { image: { url: req.body.input } } }]
        },
        metadata,
        (err, response) => {
            if (err) {
                console.log("Error: " + err);
                return;
            }

            if (response.status.code !== 10000) {
                console.log("Received failed status: " + response.status.description + "\n" + response.status.details);
                return;
            }
            // console.log(response);
            res.json(response);
        }
    );
}

app.get("/", (req, res) => {
    res.send("Maintained route");
})

app.post("/signin", (req, res) => {
    const { email, password } = req.body;

    return db
        .select('email', 'hash')
        .from('login')
        .where('email', '=', email)
        .then(data => {
            user = data[0];
            if (user && bcrypt.compareSync(password, user.hash)) {
                db.select().from('users')
                    .where('email', '=', email)
                    .then(user => {
                        res.json(user[0]);
                    })
                    .catch(err => res.status(400).json('unable to get user'));
            } else {
                res.status(400).json("wrong credentials");
            }
        })
        .catch(err => res.status(400).json("wrong credentials"));
})

app.post("/register", (req, res) => {
    const { email, name, password } = req.body;
    if (!email || !name || !password) {
        return res.status(400).json("incorrect form submission");
    }
    const hash = bcrypt.hashSync(password, bcrypt.genSaltSync());
    return db
        .transaction(trx => {
            trx
                .insert({
                    hash,
                    email
                })
                .into('login')
                .returning('email')
                .then(loginEmail => {
                    return trx('users')
                        .returning('*')
                        .insert({
                            email: loginEmail[0].email,
                            name,
                            joined: new Date()
                        })
                        .then(user => {
                            res.json(user[0])
                        })
                })
                .then(trx.commit)
                .catch(trx.rollback)
        })
        .catch(err => res.status(400).json("unable to register"));

})

app.get("/profile/:id", (req, res) => {
    const { id } = req.params;
    return db
        .select('*')
        .from('users')
        .where({
            id
        })
        .then(user => {
            if (user.length) {
                return res.json(user[0]);
            }
            res.status(404).json("Not found");
        })
        .catch(err => res.status(400).json("error getting user"));
})

app.put("/image", (req, res) => {
    const { id } = req.body;
    return db('users')
        .where('id', '=', id)
        .increment('entries', 1)
        .returning('entries')
        .then(entries => res.json(entries[0].entries))
        .catch(err => res.status(400).json("error while updating entries"));
});

app.post("/imageurl", handleApiCall);

app.listen(PORT, () => {
    console.log(`app is running on port ${PORT}`);
})