import { promisify } from 'util';
import * as Axios from 'axios';
import { Request, Response, NextFunction } from "express";
import * as jsonwebtoken from 'jsonwebtoken';
const jwkToPem = require('jwk-to-pem');

interface ClaimVerifyRequest {
    [x: string]: any;
    readonly token?: string;
}

interface ClaimVerifyResult {
    readonly userName: string;
    readonly clientId: string;
    readonly isValid: boolean;
    readonly error?: any;
}

interface TokenHeader {
    kid: string;
    alg: string;
}
interface PublicKey {
    alg: string;
    e: string;
    kid: string;
    kty: string;
    n: string;
    use: string;
}
interface PublicKeyMeta {
    instance: PublicKey;
    pem: string;
}

interface PublicKeys {
    keys: PublicKey[];
}

interface MapOfKidToPublicKey {
    [key: string]: PublicKeyMeta;
}

interface Claim {
    token_use: string;
    auth_time: number;
    iss: string;
    exp: number;
    username: string;
    client_id: string;
}


export const checkJwtCognito = async (request: ClaimVerifyRequest, res: Response, next: NextFunction) => {

    const cognitoPoolId = process.env.COGNITO_POOL_ID || '';
    if (!cognitoPoolId) {
        throw new Error('env var required for cognito pool');
    }
    const cognitoIssuer = `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${cognitoPoolId}`;
    console.log(`cognitoIssuer: ${cognitoIssuer}`);
    let cacheKeys: MapOfKidToPublicKey | undefined;
    const getPublicKeys = async (): Promise<MapOfKidToPublicKey> => {
        if (!cacheKeys) {
            const url = `${cognitoIssuer}/.well-known/jwks.json`;
            const publicKeys = await Axios.default.get<PublicKeys>(url);
            cacheKeys = publicKeys.data.keys.reduce((agg, current) => {
                const pem = jwkToPem(current);
                agg[current.kid] = { instance: current, pem };
                return agg;
            }, {} as MapOfKidToPublicKey);
            return cacheKeys;
        } else {
            return cacheKeys;
        }
    };

    const verifyPromised = promisify(jsonwebtoken.verify.bind(jsonwebtoken));


    let result: ClaimVerifyResult;
    console.log(`user claim verify invoked for token checkJwtCognito`);
    try {
        const token = request.headers.authorization.split("Bearer ")[1];
        const tokenSections = (token || '').split('.');
        if (tokenSections.length < 2) {
            throw new Error('requested token is invalid');
        }
        const headerJSON = Buffer.from(tokenSections[0], 'base64').toString('utf8');
        const header = JSON.parse(headerJSON) as TokenHeader;
        const keys = await getPublicKeys();
        const key = await keys[header.kid];
        if (key === undefined) {
            throw new Error('claim made for unknown kid');
        }
        const claim = await verifyPromised(token, key.pem) as Claim;
        const currentSeconds = Math.floor((new Date()).valueOf() / 1000);
        if (currentSeconds > claim.exp || currentSeconds < claim.auth_time - 5) {
            console.log('currentSeconds: ', currentSeconds, 'claim.exp: ', claim.exp, 'claim.auth_time: ', claim.auth_time);
            throw new Error('claim is expired or invalid');
        }
        if (claim.iss !== cognitoIssuer) {
            throw new Error('claim issuer is invalid');
        }
        if (claim.token_use !== 'access') {
            throw new Error('claim use is not access');
        }
        console.log(`claim confirmed for ${claim.username}`);
        result = { userName: claim.username, clientId: claim.client_id, isValid: true };
    } catch (error) {
        result = { userName: '', clientId: '', error, isValid: false };

    }
    console.log(result)
    // return result as ClaimVerifyResult;
    // res.body("user", result);
    res.locals.result = result;
    //Call the next middleware or controller
    next();

};



