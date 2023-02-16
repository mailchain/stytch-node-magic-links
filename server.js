const express = require("express");
const bodyParser = require("body-parser");
const url = require('url');
const stytch = require("stytch")
const { Mailchain } = require('@mailchain/sdk')

require('dotenv').config()

const app = express();
const port = process.env.PORT;
const path = `http://localhost:${port}`
const magicLinkUrl = `${path}/authenticate`

// bodyParser allows us to access the body of the post request
app.use(bodyParser.urlencoded({ extended: true }));
// defines the directory where the static assets are so images & css render correctly
app.use(express.static('public'));
// set app to use ejs so we can use html templates
app.set('view engine', 'ejs')

// define the stytch client using your stytch project id & secret
// use stytch.envs.live if you want to hit the live api
const client = new stytch.Client({
        project_id: process.env.STYTCH_PROJECT_ID,
        secret: process.env.STYTCH_SECRET,
        env: stytch.envs.test,
    }
);
const mailchain = Mailchain.fromSecretRecoveryPhrase(process.env.SECRET_RECOVERY_PHRASE)

// define the homepage route
app.get("/", (req, res) => {
    res.render('loginOrSignUp');
});

// takes the email entered on the homepage and hits the stytch
// loginOrCreateUser endpoint to send the user a magic link
app.post('/login_or_create_user', async function (req, res) {
    const params = {
        email: req.body.email,
        login_magic_link_url: magicLinkUrl,
        signup_magic_link_url: magicLinkUrl,
    };

	const isMailchain = params.email.endsWith('mailchain.com');
	if (isMailchain) {
		const userSearchResult = await client.users.search({
		    query: {
		      operator: "AND",
		      operands: [
		        { filter_name: "email_address", filter_value: [ params.email ] },
		      ],
		    },
		  });
	
		const existingUser = userSearchResult.results[0];
		const userToAuth = existingUser ?? (await client.users.create({ create_user_as_pending: true, email: req.body.email,}));	
		const magicLinkParams = await client.magicLinks.create({ user_id: userToAuth.user_id })
		const subject = "Stytch Magic 🪄 Link"
		const magicLinkUrlWithToken = `${magicLinkUrl}?userId=${magicLinkParams.user_id}&token=${magicLinkParams.token}` 
		const content = {
			text: `Navigate to ${magicLinkUrlWithToken} to authenticate`,
			html: `
			  <div>
			  	<h1>Your ${existingUser ? 'login' : 'sign up'} request. Click on the button to proceed.</h1>
				<div style="text-decoration: none; margin:10px; padding:10px; display:inline-block; background-color: rgb(16, 110, 233); border: 1px solid rgb(16, 110, 233); border-radius: 4px;">
				  <a style="color: white" href={${magicLinkUrlWithToken}}>${existingUser ? 'LOGIN' : 'SING UP'}</a>
				</div>
			  </div>`
		}

		return mailchain.sendMail({
			from: (await mailchain.user()).address,
			to: [params.email],
			subject,
			content
		})
		.then(r => res.render('emailSent'))
		.catch((e) => {
			console.error('Failed sending message', e);
			return res.status(500).render('loginOrSignUp');
		})
	}

    client.magicLinks.email.loginOrCreate(params)
        .then(
		        // on success, render the emailSent page
		        res.render('emailSent')
		    )
		    .catch(err => {
			        // on failure, log the error then render the homepage
			        console.log(err)
			        res.render('loginOrSignUp')
			    });
		})
		
		
// This is the endpoint the link in the magic link hits. It takes the token from the
// link's query params and hits the stytch authenticate endpoint to verify the token is valid
app.get('/authenticate', function (req, res) {
    const queryObject = url.parse(req.url,true).query;
    client.magicLinks.authenticate(queryObject.token)
        .then(r =>
            // on success render the logged in view
            res.render('loggedIn')
        )
        .catch(err => {
            // on failure, log the error then render the homepage
            console.log(err)
            res.render('loginOrSignUp')
        });
})

// handles the logout endpoint
app.get('/logout', function (req, res) {
    res.render('loggedOut');
})

// run the server
app.listen(port, () => {
    console.log(`Listening to requests on ${path}`);
});
