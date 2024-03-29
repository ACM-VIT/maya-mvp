import express, { Request, Response, NextFunction } from "express"
import bodyParser from "body-parser"
import { IEnvironment, IMayaRouteDefinition, IMayaTriggerDefinition } from "../parser/core/interface";
import { CommonBaseClass } from "../common/class"
import { MayaRouteProcessor } from "./routeProcessor";
import faker from "faker/locale/en_IND"
import { TriggerNotFoundException } from "../exceptions/trigger"
import { MayaTriggerProcessor } from ".";
class HttpWebServer extends CommonBaseClass {

    private _app: express.Application;
    private _port: number = 3000
    private _environment: IEnvironment
    private _triggers: Array<IMayaTriggerDefinition> = []

    constructor() {
        super("HttpWebServer")

        this._app = express();
        this._app.use(bodyParser.urlencoded({ extended: true }))
        this._app.use(bodyParser.json())
        this._app.get("/", (req, res) => { return res.json({ alive: true }) })

        this._environment = {}
    }

    public start() {
        this._app.listen(this._port)
        this.__logInfo(`Server started on http://localhost:${this._port}`)
    }

    public registerRoutes(routes: Array<IMayaRouteDefinition>) {
        routes.forEach(route => {
            this._processesAndRegisterRoute(route)
        })
    }

    public registerTriggers(triggers: Array<IMayaTriggerDefinition>) {
        this._triggers = triggers
    }

    private async _processesAndRegisterRoute(route: IMayaRouteDefinition) {
        const routeProcessor = new MayaRouteProcessor(route)
        const processedRoute = await routeProcessor.process()

        route = processedRoute.route
        const requestMethod = <keyof express.Application><unknown>route.method.name

        // register route handler
        this._app[requestMethod](route.url,
            async (req: express.Request, res: express.Response) => {

                // run triggers before route
                if (route.before) {
                    route.before.forEach(triggerName => {
                        this._runTrigger(this._getTriggerByName(triggerName))
                    })
                }

                // run route 
                let response = route.response
                if (route.response instanceof Function) {
                    response = await route.response({
                        environment: processedRoute.environment,
                        prompt: processedRoute.prompt,
                        request: req,
                        faker
                    })
                }

                // run triggers after route
                if (route.after) {
                    route.after.forEach(triggerName => {
                        this._runTrigger(this._getTriggerByName(triggerName))
                    })
                }

                return res.json(response)
            }
        )
    }

    private _getTriggerByName(triggerName: string): IMayaTriggerDefinition {
        const trigger = this._triggers.find(trigger => trigger.name === triggerName)
        if (!trigger) {
            throw new TriggerNotFoundException(triggerName)
        }
        return trigger
    }

    private _runTrigger(trigger: IMayaTriggerDefinition) {
        const triggerHandler = new MayaTriggerProcessor(trigger)
        triggerHandler.run()
    }
}

export { HttpWebServer }