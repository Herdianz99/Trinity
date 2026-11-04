// Alcance de incidencias por departamento (Session 179).
// - ADMIN: ve y gestiona todos los departamentos.
// - Miembro de un departamento = su ROL esta en `roles` del departamento, o tiene
//   User.incidentDepartmentId apuntando a el. Crea incidencias y tipos en SUS departamentos.
// - Ve las incidencias de sus departamentos + las de los departamentos que lo listan en
//   `viewerDepartmentIds` (solo lectura: no puede crear ahi).
export interface IncidentScope {
  isAdmin: boolean;
  memberIds: string[]; // donde puede crear incidencias y tipos
  visibleIds: string[]; // cuyas incidencias puede ver
}

export interface ScopeUser {
  id: string;
  role: string;
}
