import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Plus, FolderOpen, Star, StarOff, ChevronLeft, ChevronRight,
  Calendar, PoundSterling, Clock, X
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth, isSameDay, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { APA_CREW_ROLES, DEPARTMENTS, getRolesByDepartment, type CrewRole } from '@/data/apa-rates';

interface Project {
  id: string;
  name: string;
  client_name: string | null;
  created_at: string;
  days: ProjectDay[];
}

interface ProjectDay {
  id: string;
  project_id: string;
  day_number: number;
  work_date: string;
  role_name: string;
  grand_total: number;
}

interface FavouriteRole {
  id: string;
  role_name: string;
  default_rate: number | null;
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [favourites, setFavourites] = useState<FavouriteRole[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [loading, setLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadProjects();
      loadFavourites();
    }
  }, [user]);

  const loadProjects = async () => {
    setLoading(true);
    const { data: projectsData } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });

    if (projectsData) {
      const projectIds = projectsData.map(p => p.id);
      const { data: daysData } = await supabase
        .from('project_days')
        .select('*')
        .in('project_id', projectIds.length > 0 ? projectIds : ['__none__'])
        .order('day_number', { ascending: true });

      const enriched = projectsData.map(p => ({
        ...p,
        days: (daysData || []).filter(d => d.project_id === p.id),
      }));
      setProjects(enriched);
    }
    setLoading(false);
  };

  const loadFavourites = async () => {
    const { data } = await supabase
      .from('favourite_roles')
      .select('*')
      .eq('user_id', user!.id);
    if (data) setFavourites(data);
  };

  const toggleFavourite = async (role: CrewRole) => {
    const existing = favourites.find(f => f.role_name === role.role);
    if (existing) {
      const { error } = await supabase.from('favourite_roles').delete().eq('id', existing.id);
      if (!error) {
        setFavourites(prev => prev.filter(f => f.id !== existing.id));
      } else {
        console.error('Failed to remove favourite:', error);
      }
    } else {
      const { data, error } = await supabase.from('favourite_roles').insert({
        user_id: user!.id,
        role_name: role.role,
        default_rate: role.maxRate,
      }).select().single();
      if (error) {
        console.error('Failed to add favourite:', error);
      } else if (data) {
        setFavourites(prev => [...prev, data]);
      }
    }
  };

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    setProjectError(null);
    const { data, error } = await supabase.from('projects').insert({
      user_id: user!.id,
      name: newProjectName.trim(),
      client_name: newClientName.trim() || null,
    }).select().single();

    if (error) {
      setProjectError(`Error: ${error.message} (code: ${error.code})`);
      return;
    }

    if (data) {
      setShowNewProject(false);
      setNewProjectName('');
      setNewClientName('');
      navigate(`/calculator?project=${data.id}&name=${encodeURIComponent(data.name)}`);
    }
  };

  // Calendar data
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart); // 0=Sun

  const allProjectDays = useMemo(() => {
    return projects.flatMap(p => p.days.map(d => ({ ...d, projectName: p.name })));
  }, [projects]);

  const getDayProjects = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return allProjectDays.filter(d => d.work_date === dateStr);
  };

  // Monthly stats
  const monthProjects = useMemo(() => {
    return allProjectDays.filter(d => {
      const date = parseISO(d.work_date);
      return isSameMonth(date, currentMonth);
    });
  }, [allProjectDays, currentMonth]);

  const monthTotal = monthProjects.reduce((sum, d) => sum + (d.grand_total || 0), 0);

  const isFavourite = (roleName: string) => favourites.some(f => f.role_name === roleName);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage your projects and crew bookings</p>
        </div>
        <Button onClick={() => setShowNewProject(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </div>

      {/* New Project Dialog */}
      {showNewProject && (
        <Card className="border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold">Create New Project</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowNewProject(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Project Name</Label>
                <Input placeholder="e.g. Nike Summer Campaign" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} autoFocus />
              </div>
              <div className="space-y-2">
                <Label>Client (optional)</Label>
                <Input placeholder="e.g. Nike UK" value={newClientName} onChange={e => setNewClientName(e.target.value)} />
              </div>
            </div>
            {projectError && (
              <p className="text-sm text-red-500 mt-3">{projectError}</p>
            )}
            <div className="flex gap-2 mt-4">
              <Button onClick={createProject} disabled={!newProjectName.trim()}>Create & Open Calculator</Button>
              <Button variant="outline" onClick={() => setShowNewProject(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Projects + Calendar */}
        <div className="lg:col-span-2 space-y-6">
          {/* Monthly Calendar */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {format(currentMonth, 'MMMM yyyy')}
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())}>Today</Button>
                  <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {monthProjects.length > 0 && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                  <span>{monthProjects.length} day{monthProjects.length !== 1 ? 's' : ''} booked</span>
                  <span className="font-medium text-foreground">Total: £{monthTotal.toFixed(0)}</span>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-px">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                ))}
                {/* Empty cells for start of month (Mon=0 based) */}
                {Array.from({ length: (startDayOfWeek + 6) % 7 }, (_, i) => (
                  <div key={`empty-${i}`} className="min-h-[60px]" />
                ))}
                {calendarDays.map(date => {
                  const dayProjects = getDayProjects(date);
                  const isToday = isSameDay(date, new Date());
                  return (
                    <div
                      key={date.toISOString()}
                      className={`min-h-[60px] rounded-xl p-1.5 text-sm transition-all ${
                        isToday ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted'
                      }`}
                    >
                      <span className={`text-xs ${isToday ? 'font-bold text-primary' : 'text-muted-foreground'}`}>
                        {format(date, 'd')}
                      </span>
                      {dayProjects.slice(0, 2).map((dp, i) => (
                        <div key={i} className="mt-0.5 truncate rounded-md bg-primary/15 px-1 py-0.5 text-[10px] font-medium text-primary leading-tight">
                          {dp.projectName}
                        </div>
                      ))}
                      {dayProjects.length > 2 && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">+{dayProjects.length - 2} more</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Projects List */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Projects</h2>
            {loading ? (
              <div className="text-muted-foreground text-sm">Loading projects...</div>
            ) : projects.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No projects yet. Create your first project to get started.</p>
                  <Button className="mt-4" onClick={() => setShowNewProject(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Create Project
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map(project => {
                  const totalCost = project.days.reduce((sum, d) => sum + (d.grand_total || 0), 0);
                  const dateRange = project.days.length > 0
                    ? `${format(parseISO(project.days[0].work_date), 'dd MMM')}${project.days.length > 1 ? ` – ${format(parseISO(project.days[project.days.length - 1].work_date), 'dd MMM')}` : ''}`
                    : 'No days added';

                  return (
                    <Card
                      key={project.id}
                      className="cursor-pointer hover:scale-[1.01] hover:shadow-lg transition-all duration-200"
                      onClick={() => navigate(`/calculator?project=${project.id}`)}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate">{project.name}</h3>
                            {project.client_name && (
                              <p className="text-sm text-muted-foreground truncate">{project.client_name}</p>
                            )}
                          </div>
                          <Badge variant="outline" className="ml-2 shrink-0">
                            {project.days.length} day{project.days.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {dateRange}
                          </span>
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            <PoundSterling className="h-3.5 w-3.5" />
                            {totalCost > 0 ? `£${totalCost.toFixed(0)}` : '—'}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Favourites */}
        <div className="space-y-6">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Star className="h-5 w-5 text-amber-500" />
                Favourite Roles
              </CardTitle>
            </CardHeader>
            <CardContent>
              {favourites.length === 0 ? (
                <p className="text-sm text-muted-foreground mb-4">
                  Star roles below for quick access when creating calculations.
                </p>
              ) : (
                <div className="space-y-2 mb-4">
                  {favourites.map(fav => {
                    const role = APA_CREW_ROLES.find(r => r.role === fav.role_name);
                    return (
                      <div key={fav.id} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{fav.role_name}</p>
                          <p className="text-xs text-muted-foreground">{role?.department} | £{fav.default_rate || role?.maxRate || '—'}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => role && toggleFavourite(role)}>
                          <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <Separator className="my-3" />
              <p className="text-xs font-medium text-muted-foreground mb-2">All Roles</p>
              <div className="max-h-[400px] overflow-y-auto space-y-0.5 pr-1">
                {DEPARTMENTS.map(dept => (
                  <div key={dept}>
                    <p className="text-xs font-semibold text-muted-foreground mt-2 mb-1 px-1">{dept}</p>
                    {getRolesByDepartment(dept).map(role => (
                      <div
                        key={role.role}
                        className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted transition-colors"
                      >
                        <span className="text-sm truncate">{role.role}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => toggleFavourite(role)}
                        >
                          {isFavourite(role.role)
                            ? <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                            : <StarOff className="h-3.5 w-3.5 text-muted-foreground" />
                          }
                        </Button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
