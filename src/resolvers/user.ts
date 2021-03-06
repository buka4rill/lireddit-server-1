// USER RESOLVER (GRAPHQL)

import { User } from '../entities/User';
import { MyContext } from '../types';
import { Arg, Ctx, Field, InputType, Mutation, ObjectType, Query, Resolver } from 'type-graphql';
import argon from "argon2";
import { COOKIE_NAME } from '../constants';

/**
    * Instead of having multiple Args, the class is created
    * ObjectTypes can be returned in mutation, InputTypes in are used in Args
    * Set "request.credentials" key in GraphQL playground to "include"
 */

// A different way to do Args in GQL using Input types
@InputType()
class UsernamePasswordInput {
    @Field()
    username: string;

    @Field()
    password: string;
}

@ObjectType()
class FieldError {
    @Field()
    field: string;

    @Field()
    message: string;
}

@ObjectType()
class UserResponse {
    @Field(() => [FieldError], { nullable: true })
    errors?: FieldError[]; // Error or undefined returned if it doesn't work

    @Field(() => User, { nullable: true })
    user?: User; // User returned if it works properly

}

@Resolver()
export class UserResolver 
{

    // Register a User
    @Mutation(() => UserResponse) 
    async register( @Arg('input') input: UsernamePasswordInput, @Ctx() { em, req }: MyContext ): Promise<UserResponse> 
    {
        // Ensure Username is present
        if (input.username.length <= 2) {
            return {
                errors: [
                    {
                        field: "username",
                        message: "Length must be greater than 2"
                    }
                ]
            }
        }

        // Check for password
        if (input.password.length <= 2) {
            return {
                errors: [
                    {
                        field: "password",
                        message: "Length must be greater than 2"
                    }
                ]
            }
        }

        // Hashed password
        const pswd = await argon.hash(input.password);
        
        // Create User object
        const user = em.create(User, { 
            username: input.username, 
            password: pswd 
        });

        try {
            // save User to db
            await em.persistAndFlush(user);
        } catch (err) {
            // Username already exists
            if (err.code === "23505" || err.detail.includes("already exists")){
                return {
                    errors: [
                        {
                            field: "username",
                            message: "Username exists already"
                        }
                    ],
                }
            }
            
            // console.log(err);
        }

        // Store user id session
        // this will set the cookie of the user
        // and keep them logged in
        req.session.userId = user.id;

        return { user };
    }

    // Login a User
    @Mutation(() => UserResponse) 
    async login( @Arg('input') input: UsernamePasswordInput, @Ctx() { em, req }: MyContext ): Promise<UserResponse> 
    {
        // Check for user by username
        const user = await em.findOne(User, { username: input.username });

        // If not found
        if (!user) {
            return {
                errors: [
                    { 
                        field: "username",
                        message: "that Username doesn't exist"
                    }
                ]
            };
        }

        // Verify password
        const validPswd = await argon.verify(user.password, input.password);
        if (!validPswd) {
            return {
                errors: [
                    {
                        field: "password",
                        message: "Incorrect password"
                    }
                ],
            }
        }

        // save User to db
        await em.persistAndFlush(user);

        // Session
        req.session.userId = user.id;

        return { user };
    }

    // Return Current User if Logged in
    @Query(() => User, { nullable: true })
    async me( @Ctx() { req, em }: MyContext ) {
        console.log("session: ", req.session)
        // user not logged in
        if (!req.session.userId) {
            return null
        }

        const user = await em.findOne(User, { id: req.session.userId });
        return user;
    }

    @Mutation(() => Boolean)
    logout(@Ctx() { req, res }: MyContext) {
        return new Promise(resolver => req.session.destroy(err => {
            // Clear cookie
            res.clearCookie(COOKIE_NAME);

            if (err) {
                console.log(err);
                resolver(false);
                return;
            } 
            
            resolver(true);
        }));
    }
}