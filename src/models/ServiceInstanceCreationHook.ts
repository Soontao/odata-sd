import { afterSave, beforeCreate, HookContext, HookProcessor } from "@odata/server";
import fetch from "node-fetch";
import { ServiceInstance } from ".";

const healthCheckStorage = new Map<string, any>();

const getKey = (instance: ServiceInstance) => `${instance.ServiceName}-${instance.InstanceHost}-${instance.InstancePort}`;
const getURI = (instance: ServiceInstance) => `${instance.InstanceProtocol || 'http'}://${instance.InstanceHost}:${instance.InstancePort}/${instance.InstanceHealthPath}`;

const checkInstance = async (instance: ServiceInstance) => {
  const url = getURI(instance);
  try {
    await fetch(url);
  } catch (error) {
    throw new Error(`check service instance failed, ${url}`);
  }
};

@beforeCreate(ServiceInstance)
export class ServiceInstanceBeforeCreationHook extends HookProcessor<ServiceInstance> {

  async execute(hookContext: HookContext<ServiceInstance>): Promise<void> {
    await checkInstance(hookContext.data);
  }

}

@afterSave(ServiceInstance)
export class ServiceInstanceAfterCreationHook extends HookProcessor<ServiceInstance> {

  async execute(hookContext: HookContext<ServiceInstance>): Promise<void> {
    switch (hookContext.context.method) {
      case "POST":
        const instance = hookContext.data;
        const key = getKey(instance);
        if (!healthCheckStorage.has(key)) {

          const url = getURI(instance);
          const timer = setInterval(async () => {
            try {
              await fetch(url);
            } catch (error) {
              console.error(`check url: '${url}' failed`);

              // error happened
              try {
                await hookContext.getConnection().getRepository(ServiceInstance).delete(instance);
                clearInterval(healthCheckStorage.get(key));
                healthCheckStorage.delete(key);
                console.error(`remove service instance: '${getKey(instance)}'`);
              } catch (error) {
                console.error(`remove service instance failed: '${getKey(instance)}'`);
              }

            }
          }, 5 * 1000);

          healthCheckStorage.set(key, timer);

          console.info(`register service instance: ${key}`);
        }
        break;
      default:
        break;
    }
  }

}