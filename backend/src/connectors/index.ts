// Picks which connector to use, based on the PROVISIONER and CONFIGURATOR settings.

import { config } from "../config";
import { Configurator, Provisioner } from "./types";
import { MockProvisioner } from "./mockProvisioner";
import { LocalTerraformProvisioner } from "./localTerraformProvisioner";
import { GitLabProvisioner } from "./gitlabProvisioner";
import { MockConfigurator } from "./mockConfigurator";
import { AwxConfigurator } from "./awxConfigurator";

export function getProvisioner(): Provisioner {
  if (config.provisioner === "local") {
    return new LocalTerraformProvisioner();
  }
  if (config.provisioner === "gitlab") {
    return new GitLabProvisioner();
  }
  return new MockProvisioner();
}

export function getConfigurator(): Configurator {
  if (config.configurator === "awx") {
    return new AwxConfigurator();
  }
  return new MockConfigurator();
}
