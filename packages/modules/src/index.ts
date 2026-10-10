export interface Manifest {
  id: string;
  version: string;
  apiVersion: 1;
  public: boolean;
  dependencies: string[];
  permissions: string[];
  health: () => Promise<boolean>;
}
export class ModuleRegistry {
  private manifests = new Map<string, Manifest>();
  register(m: Manifest) {
    if (
      this.manifests.has(m.id) ||
      m.apiVersion !== 1 ||
      m.dependencies.some((d) => !this.manifests.has(d))
    )
      throw new Error("Modul inkompatibel oder Abhängigkeit fehlt.");
    this.manifests.set(m.id, m);
  }
  activate(id: string, communityApproved: boolean, ownerApproved: boolean) {
    const m = this.manifests.get(id);
    if (
      !m ||
      !ownerApproved ||
      (m.public && id !== "polls" && !communityApproved)
    )
      throw new Error("Freigabe fehlt.");
    return m;
  }
  list() {
    return [...this.manifests.values()].map(({ health, ...m }) => m);
  }
}
