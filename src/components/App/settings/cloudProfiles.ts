export type CloudProviderId = 'custom-vm' | 'modal';
export type CloudConnectionMethod = 'ssh-key' | 'ssh-agent' | 'modal-token';

export type CloudProfile = {
  id: string;
  title: string;
  provider: CloudProviderId;
  runtime: string;
  connectionMethod?: CloudConnectionMethod;
  status: 'Ready' | 'Draft';
};

export const cloudConnectionMethodLabels: Record<CloudConnectionMethod, string> = {
  'ssh-key': 'SSH key bootstrap',
  'ssh-agent': 'SSH agent',
  'modal-token': 'Modal token'
};

export const defaultCloudProfiles: CloudProfile[] = [
  {
    id: 'core-dev-vm',
    title: 'Core Dev VM',
    provider: 'custom-vm',
    runtime: 'ubuntu@dev-eu-west · ~/workspace/octomus',
    connectionMethod: 'ssh-key',
    status: 'Ready'
  },
  {
    id: 'modal-sandbox',
    title: 'Modal Sandbox',
    provider: 'modal',
    runtime: 'octomus/dev-shell · image: launcher:latest',
    connectionMethod: 'modal-token',
    status: 'Draft'
  }
];
